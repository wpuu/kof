/**
 * KOF V2 input reliability prototype.
 * Selective ACK / bounded resend of game-frame input, not a production
 * match manager. The actual game must pause/abort on unsafe delivery.
 */
import {
  PacketType, AbortReason, encodePacket, decodePacket, MAX_FRAME
} from './v2_protocol.mjs';

function checkInt(v, label, min, max) {
  if (!Number.isInteger(v) || v < min || v > max)
    throw new RangeError(`${label} out of range`);
}
export class ReliableInputPeer {
  constructor({
    matchId, role, configFingerprint, historyLimit = 256,
    rollbackWindow = 8, requestCooldownMs = 35,
    resendLimit = 5, maxFutureFrames = 64
  }) {
    checkInt(matchId, 'matchId', 1, 0xffffffff);
    checkInt(role, 'role', 0, 1);
    checkInt(configFingerprint, 'configFingerprint', 0, 0xffffffff);
    checkInt(historyLimit, 'historyLimit', 40, 4096);
    checkInt(rollbackWindow, 'rollbackWindow', 1, 64);
    checkInt(requestCooldownMs, 'requestCooldownMs', 1, 10000);
    checkInt(resendLimit, 'resendLimit', 1, 64);
    checkInt(maxFutureFrames, 'maxFutureFrames', 1, 256);
    this.matchId = matchId;
    this.role = role;
    this.configFingerprint = configFingerprint;
    this.historyLimit = historyLimit;
    this.rollbackWindow = rollbackWindow;
    this.requestCooldownMs = requestCooldownMs;
    this.resendLimit = resendLimit;
    this.maxFutureFrames = maxFutureFrames;
    this.sent = new Map();
    this.received = new Map();
    this.acked = new Set();
    this.requestTime = new Map();
    this.resendTimes = new Map();
    this.confirmedThrough = -1;
    this.highestReceived = -1;
    this.nextSequence = 0;
    this.lastOutgoingFrame = -1;
    this.handshakeComplete = false;
    this.aborted = false;
    this.abortReason = null;
    this.metrics = {
      received: 0, duplicates: 0, invalid: 0, acks: 0,
      resendRequests: 0, resentPackets: 0, missingInputFrames: 0,
      lateCriticalFrames: 0, aborts: 0, evictedUnackedFrames: 0
    };
  }
  seq() {
    const value = this.nextSequence;
    this.nextSequence = (this.nextSequence + 1) >>> 0;
    return value;
  }
  pack(type, data) {
    return encodePacket({
      type, matchId: this.matchId, seq: this.seq(), ...data
    });
  }
  hello() {
    return this.pack(PacketType.HELLO, {
      role: this.role, configFingerprint: this.configFingerprint
    });
  }
  safeAbort(reason = AbortReason.UNRECOVERABLE_INPUT) {
    if (!this.aborted) {
      this.aborted = true;
      this.abortReason = reason;
      this.metrics.aborts++;
    }
    return this.pack(PacketType.MATCH_ABORT, { reason: this.abortReason });
  }
  assertLive() {
    if (this.aborted) throw new Error('match aborted: no trusted frame settlement');
  }
  sendInput(frame, mask) {
    this.assertLive();
    checkInt(frame, 'frame', 0, MAX_FRAME);
    checkInt(mask, 'mask', 0, 0x7f);
    if (frame <= this.lastOutgoingFrame)
      throw new Error('sendInput frames must be strictly increasing');
    this.lastOutgoingFrame = frame;
    this.sent.set(frame, mask);
    while (this.sent.size > this.historyLimit) {
      const first = this.sent.keys().next().value;
      this.sent.delete(first);
      if (!this.acked.has(first)) this.metrics.evictedUnackedFrames++;
    }
    return this.pack(PacketType.INPUT, { frame, mask });
  }
  /** Cumulative ACK plus 32-bit selective ACK bitmap for holes. */
  makeAck() {
    let bitmap = 0;
    for (let i = 0; i < 32; i++) {
      const frame = this.confirmedThrough + 1 + i;
      if (this.received.has(frame)) bitmap = (bitmap | (1 << i)) >>> 0;
    }
    return this.pack(PacketType.INPUT_ACK, {
      through: this.confirmedThrough, bitmap
    });
  }
  /** Missing input frames are only requested once a later frame is seen. */
  makeMissingRequest(nowMs = 0) {
    this.assertLive();
    checkInt(nowMs, 'nowMs', 0, 2 ** 53 - 1);
    if (this.highestReceived <= this.confirmedThrough + 1) return null;
    const missing = [];
    const end = Math.min(this.highestReceived - 1, this.confirmedThrough + 32);
    for (let frame = this.confirmedThrough + 1; frame <= end; frame++) {
      if (this.received.has(frame)) continue;
      const last = this.requestTime.get(frame);
      if (last !== undefined && nowMs - last < this.requestCooldownMs) continue;
      missing.push(frame);
      if (missing.length >= 8) break;
    }
    if (!missing.length) return null;
    for (const frame of missing) this.requestTime.set(frame, nowMs);
    this.metrics.resendRequests += missing.length;
    return this.pack(PacketType.RESEND_REQUEST, { frames: missing });
  }
  /** Engine must check this before trusting any frame or prize settlement. */
  checkSafety(currentSimFrame) {
    checkInt(currentSimFrame, 'currentSimFrame', 0, MAX_FRAME);
    if (this.aborted) return { ok: false, packet: null, reason: this.abortReason };
    const missing = this.confirmedThrough + 1;
    if (missing < this.highestReceived &&
        currentSimFrame - missing > this.rollbackWindow) {
      this.metrics.lateCriticalFrames++;
      return { ok: false, packet: this.safeAbort(), reason: this.abortReason,
        missingFrame: missing };
    }
    if (this.metrics.evictedUnackedFrames > 0) {
      // Sender cannot guarantee that required input is still available.
      return { ok: false, packet: this.safeAbort(), reason: this.abortReason,
        evictedUnackedFrames: this.metrics.evictedUnackedFrames };
    }
    return { ok: true, confirmedThrough: this.confirmedThrough };
  }
  receive(raw, { currentSimFrame = 0 } = {}) {
    this.assertLive();
    checkInt(currentSimFrame, 'currentSimFrame', 0, MAX_FRAME);
    let msg;
    try {
      msg = decodePacket(raw, { expectedMatchId: this.matchId });
    } catch (error) {
      this.metrics.invalid++;
      throw error;
    }
    switch (msg.type) {
      case PacketType.HELLO:
        if (msg.role === this.role ||
            msg.configFingerprint !== this.configFingerprint) {
          return { type: 'abort', packet: this.safeAbort(AbortReason.VERSION_MISMATCH) };
        }
        this.handshakeComplete = true;
        return { type: 'hello', accepted: true };
      case PacketType.INPUT: {
        if (!this.handshakeComplete) throw new Error('HELLO required before INPUT');
        const { frame, mask } = msg;
        if (frame > currentSimFrame + this.maxFutureFrames)
          throw new Error('input too far in future');
        if (this.received.has(frame)) {
          if (this.received.get(frame) !== mask)
            return { type: 'abort', packet: this.safeAbort(AbortReason.DESYNC) };
          this.metrics.duplicates++;
          return { type: 'duplicate', ack: this.makeAck() };
        }
        if (frame < currentSimFrame - this.rollbackWindow) {
          this.metrics.lateCriticalFrames++;
          return { type: 'abort', packet: this.safeAbort(), missingFrame: frame };
        }
        this.received.set(frame, mask);
        this.metrics.received++;
        this.highestReceived = Math.max(frame, this.highestReceived);
        while (this.received.has(this.confirmedThrough + 1)) {
          this.confirmedThrough++;
          this.requestTime.delete(this.confirmedThrough);
        }
        // Bounded state: old confirmed frames can be discarded when safe.
        for (const old of this.received.keys()) {
          if (old < this.confirmedThrough - this.historyLimit)
            this.received.delete(old);
        }
        if (this.received.size > this.historyLimit + this.maxFutureFrames)
          return { type: 'abort', packet: this.safeAbort() };
        return { type: 'input', frame, mask,
          ack: this.makeAck(), confirmedThrough: this.confirmedThrough };
      }
      case PacketType.INPUT_ACK: {
        const { through, bitmap } = msg;
        let ackedNow = 0;
        for (const frame of this.sent.keys()) {
          const offset = frame - (through + 1);
          const covered = frame <= through ||
            (offset >= 0 && offset < 32 && ((bitmap >>> offset) & 1) === 1);
          if (covered) {
            this.sent.delete(frame);
            this.acked.add(frame);
            ackedNow++;
          }
        }
        // Keep bounded ACK bookkeeping.
        while (this.acked.size > this.historyLimit) {
          this.acked.delete(this.acked.values().next().value);
        }
        this.metrics.acks += ackedNow;
        return { type: 'ack', acked: ackedNow };
      }
      case PacketType.RESEND_REQUEST: {
        const packets = [], missing = [];
        for (const frame of msg.frames) {
          const mask = this.sent.get(frame);
          if (mask === undefined) {
            missing.push(frame);
            continue;
          }
          const attempts = this.resendTimes.get(frame) ?? 0;
          if (attempts >= this.resendLimit) {
            missing.push(frame);
            continue;
          }
          this.resendTimes.set(frame, attempts + 1);
          this.metrics.resentPackets++;
          packets.push(this.pack(PacketType.INPUT, { frame, mask }));
        }
        // Requested frame no longer available: fail closed instead of silently
        // issuing a trusted outcome.
        if (missing.length) return {
          type: 'abort', missing, packet: this.safeAbort()
        };
        return { type: 'resend', packets };
      }
      case PacketType.FRAME_HASH:
        return { type: 'frame_hash', frame: msg.frame, hash: msg.hash };
      case PacketType.MATCH_ABORT:
        this.aborted = true;
        this.abortReason = msg.reason;
        this.metrics.aborts++;
        return { type: 'remote_abort', reason: msg.reason };
      default:
        throw new Error('unexpected message type');
    }
  }
}
