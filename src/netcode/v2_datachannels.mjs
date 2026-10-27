/**
 * P0-011: WebRTC dual-channel adapter for the V2 bounded reliability module.
 *
 * Host (role 0) owns channel creation; guest (role 1) receives ondatachannel.
 * kof-v2-input: ordered:false / maxRetransmits:0 for per-frame input.
 * kof-v2-control: ordered:true, reliable, for handshake, ACK, NACK, resends and abort.
 *
 * NO commercial-grade auth or authoritative game-result settlement.
 */
import { ReliableInputPeer } from './v2_reliability.mjs';
import { PacketType, AbortReason, decodePacket } from './v2_protocol.mjs';

export const FAST_LABEL = 'kof-v2-input';
export const CONTROL_LABEL = 'kof-v2-control';
const MAX_BUFFERED_BYTES = 256 * 1024;

export function createV2ChannelSession({
  pc, role, matchId, configFingerprint,
  currentFrame, onInput, onReady = () => {}, onAbort = () => {},
  now = () => performance.now(), rollbackWindow = 8,
  requestCooldownMs = 35
}) {
  if (!pc || typeof pc.createDataChannel !== 'function')
    throw new TypeError('RTCPeerConnection is required');
  if (typeof currentFrame !== 'function' || typeof onInput !== 'function')
    throw new TypeError('currentFrame and onInput callbacks are required');

  const peer = new ReliableInputPeer({
    matchId, role, configFingerprint, rollbackWindow, requestCooldownMs
  });
  let fast = null;
  let control = null;
  let ready = false;
  let disposed = false;
  let helloSent = false;
  let aborted = null;
  const metrics = {
    fastIncoming: 0, controlIncoming: 0,
    inputSent: 0, acksSent: 0, missingRequestsSent: 0,
    resendPacketsSent: 0, malformed: 0, bufferedOverruns: 0
  };
  const isOpen = channel => !!channel && channel.readyState === 'open';

  function notifyAbort(reason, detail, packet = null, remote = false) {
    if (aborted || disposed) return;
    const outgoing = remote ? null : (packet ?? (peer.aborted
      ? peer.pack(PacketType.MATCH_ABORT, { reason: peer.abortReason ?? reason })
      : peer.safeAbort(reason)));
    ready = false;
    aborted = Object.freeze({ reason, detail, remote });
    // Direct best-effort send: never recurse via the regular send helper.
    if (outgoing && isOpen(control)) {
      try { control.send(outgoing); } catch { /* fail closed locally anyway */ }
    }
    try { onAbort(aborted); } catch { /* an exception must never reenable play */ }
  }

  function sendControl(packet) {
    if (disposed || aborted) return false;
    if (!isOpen(control)) return false;
    if ((control.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES) {
      metrics.bufferedOverruns++;
      notifyAbort(AbortReason.TIMEOUT, 'control queue exceeded capacity');
      return false;
    }
    try { control.send(packet); return true; }
    catch {
      notifyAbort(AbortReason.TIMEOUT, 'control channel send failed');
      return false;
    }
  }

  function becomeReady() {
    if (ready || disposed || aborted || !peer.handshakeComplete ||
        !isOpen(control) || !isOpen(fast)) return;
    ready = true;
    try { onReady(); }
    catch { notifyAbort(AbortReason.MALFORMED, 'game ready callback failed'); }
  }

  function accept(raw, source) {
    if (disposed || aborted) return;
    try {
      if (!(raw instanceof ArrayBuffer) && !ArrayBuffer.isView(raw))
        throw new TypeError('binary V2 packets are required');
      const p = decodePacket(raw, { expectedMatchId: peer.matchId });
      if ((source === 'fast' && p.type !== PacketType.INPUT) ||
          (source === 'control' && p.type === PacketType.INPUT &&
           !peer.handshakeComplete))
        throw new Error('packet on incorrect channel or before handshake');
      if (source === 'fast') metrics.fastIncoming++;
      else metrics.controlIncoming++;
      const result = peer.receive(raw, { currentSimFrame: currentFrame() });
      switch (result.type) {
        case 'hello':
          becomeReady();
          break;
        case 'input':
          onInput(result.frame, result.mask);
          if (result.ack && sendControl(result.ack)) metrics.acksSent++;
          break;
        case 'duplicate':
          if (result.ack && sendControl(result.ack)) metrics.acksSent++;
          break;
        case 'resend':
          for (const input of result.packets) {
            if (!sendControl(input)) break;
            metrics.resendPacketsSent++;
          }
          break;
        case 'abort':
          notifyAbort(peer.abortReason ?? AbortReason.DESYNC,
            result.detail ?? 'V2 peer rejected unsafe packet', result.packet);
          break;
        case 'remote_abort':
          notifyAbort(result.reason, 'remote peer aborted the unverified match', null, true);
          break;
        case 'ack':
        case 'frame_hash':
          break;
        default:
          throw new Error('unexpected reliability result');
      }
    } catch (e) {
      metrics.malformed++;
      notifyAbort(AbortReason.MALFORMED, 'invalid or unsafe V2 peer message');
    }
  }

  function attach(channel) {
    if (!channel || (channel.label !== FAST_LABEL && channel.label !== CONTROL_LABEL)) {
      notifyAbort(AbortReason.VERSION_MISMATCH, 'unrecognized V2 channel');
      return;
    }
    if (channel.label === FAST_LABEL) {
      if (fast) return notifyAbort(AbortReason.MALFORMED, 'duplicate fast channel');
      fast = channel;
    } else {
      if (control) return notifyAbort(AbortReason.MALFORMED, 'duplicate control channel');
      control = channel;
    }
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      if (channel === control && !helloSent) {
        helloSent = true;
        sendControl(peer.hello());
      }
      becomeReady();
    };
    channel.onmessage = event => accept(event.data,
      channel === fast ? 'fast' : 'control');
    channel.onclose = () => {
      if (ready && !disposed && !aborted)
        notifyAbort(AbortReason.TIMEOUT, 'V2 datachannel disconnected');
    };
    channel.onerror = () => {
      if (!disposed && !aborted)
        notifyAbort(AbortReason.TIMEOUT, 'V2 datachannel error');
    };
    if (isOpen(channel)) channel.onopen();
  }

  if (role === 0) {
    attach(pc.createDataChannel(CONTROL_LABEL, { ordered: true }));
    attach(pc.createDataChannel(FAST_LABEL, {
      ordered: false, maxRetransmits: 0
    }));
  } else {
    pc.ondatachannel = event => attach(event.channel);
  }

  function sendInput(frame, mask) {
    if (!ready || aborted || disposed || !isOpen(fast)) return false;
    try {
      if ((fast.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES) {
        metrics.bufferedOverruns++;
        notifyAbort(AbortReason.TIMEOUT, 'fast input queue exceeded capacity');
        return false;
      }
      const packet = peer.sendInput(frame, mask);
      fast.send(packet);
      metrics.inputSent++;
      return true;
    } catch {
      notifyAbort(AbortReason.MALFORMED, 'failed to send safe V2 input');
      return false;
    }
  }

  function tick(frame = currentFrame(), nowMs = now()) {
    if (!ready || aborted || disposed) return false;
    try {
      const safety = peer.checkSafety(frame);
      if (!safety.ok) {
        notifyAbort(safety.reason ?? AbortReason.UNRECOVERABLE_INPUT,
          'missing input beyond rollback/safety limit', safety.packet);
        return false;
      }
      const request = peer.makeMissingRequest(nowMs);
      if (request && sendControl(request)) metrics.missingRequestsSent++;
      return !aborted;
    } catch {
      notifyAbort(AbortReason.MALFORMED, 'V2 frame safety check failed');
      return false;
    }
  }

  function abort(reason = AbortReason.TIMEOUT, detail = 'match aborted') {
    notifyAbort(reason, detail);
  }

  function close() {
    if (disposed) return;
    disposed = true;
    ready = false;
    try { fast?.close(); } catch {}
    try { control?.close(); } catch {}
  }

  return {
    peer, metrics, sendInput, tick, abort, close,
    get ready() { return ready && !aborted && !disposed; },
    get aborted() { return aborted; },
    get fastChannel() { return fast; },
    get controlChannel() { return control; }
  };
}
