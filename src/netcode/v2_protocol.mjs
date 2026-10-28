/**
 * KOF network protocol V2 — standalone, platform-neutral codec.
 * EXPERIMENTAL: no user authentication, commercial-grade security or game integration.
 * Little-endian; fixed 16-byte header with strict bounds.
 */
export const VERSION = 2;
export const HEADER_BYTES = 16;
export const MAX_PACKET_BYTES = 256;
export const MAX_FRAME = 0x7fffffff;
export const PacketType = Object.freeze({
  HELLO: 1, INPUT: 2, INPUT_ACK: 3, RESEND_REQUEST: 4,
  FRAME_HASH: 5, MATCH_ABORT: 6, HELLO_ACK: 7
});
export const AbortReason = Object.freeze({
  UNRECOVERABLE_INPUT: 1, DESYNC: 2, VERSION_MISMATCH: 3,
  TIMEOUT: 4, MALFORMED: 5
});
const VALID_TYPES = new Set(Object.values(PacketType));
const VALID_REASONS = new Set(Object.values(AbortReason));
const MAGIC = [0x4b, 0x4f, 0x46, 0x32]; // ASCII "KOF2"
function integer(v, label, min, max) {
  if (!Number.isInteger(v) || v < min || v > max)
    throw new RangeError(`${label} must be integer in [${min},${max}]`);
  return v;
}
function readBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(
    value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError('Packet must be an ArrayBuffer or typed array');
}
function bodyBytes(packet) {
  switch (packet.type) {
    case PacketType.HELLO: {
      integer(packet.role, 'role', 0, 1);
      integer(packet.configFingerprint, 'configFingerprint', 0, 0xffffffff);
      const body = new Uint8Array(5), d = new DataView(body.buffer);
      d.setUint8(0, packet.role);
      d.setUint32(1, packet.configFingerprint, true);
      return body;
    }
    case PacketType.INPUT: {
      integer(packet.frame, 'frame', 0, MAX_FRAME);
      integer(packet.mask, 'mask', 0, 0x7f);
      const body = new Uint8Array(5), d = new DataView(body.buffer);
      d.setUint32(0, packet.frame, true);
      d.setUint8(4, packet.mask);
      return body;
    }
    case PacketType.INPUT_ACK: {
      integer(packet.through, 'through', -1, MAX_FRAME);
      integer(packet.bitmap, 'bitmap', 0, 0xffffffff);
      const body = new Uint8Array(8), d = new DataView(body.buffer);
      d.setInt32(0, packet.through, true);
      d.setUint32(4, packet.bitmap, true);
      return body;
    }
    case PacketType.RESEND_REQUEST: {
      if (!Array.isArray(packet.frames) || packet.frames.length < 1 ||
          packet.frames.length > 8) throw new RangeError('request 1..8 frames');
      const set = new Set();
      for (const frame of packet.frames) {
        integer(frame, 'requested frame', 0, MAX_FRAME);
        if (set.has(frame)) throw new Error('duplicate request frame');
        set.add(frame);
      }
      const body = new Uint8Array(1 + 4 * packet.frames.length);
      const d = new DataView(body.buffer);
      d.setUint8(0, packet.frames.length);
      packet.frames.forEach((f, i) => d.setUint32(1 + i * 4, f, true));
      return body;
    }
    case PacketType.FRAME_HASH: {
      integer(packet.frame, 'frame', 0, MAX_FRAME);
      integer(packet.hash, 'hash', 0, 0xffffffff);
      const body = new Uint8Array(8), d = new DataView(body.buffer);
      d.setUint32(0, packet.frame, true);
      d.setUint32(4, packet.hash, true);
      return body;
    }
    case PacketType.HELLO_ACK: return new Uint8Array(0);
    case PacketType.MATCH_ABORT: {
      if (!VALID_REASONS.has(packet.reason)) throw new RangeError('invalid abort reason');
      return Uint8Array.of(packet.reason);
    }
    default: throw new RangeError('unknown packet type');
  }
}
export function encodePacket(packet) {
  if (!packet || !VALID_TYPES.has(packet.type)) throw new RangeError('unknown packet type');
  integer(packet.matchId, 'matchId', 1, 0xffffffff);
  integer(packet.seq, 'seq', 0, 0xffffffff);
  const body = bodyBytes(packet);
  const out = new Uint8Array(HEADER_BYTES + body.byteLength);
  if (out.byteLength > MAX_PACKET_BYTES) throw new RangeError('packet exceeds limit');
  out.set(MAGIC);
  const d = new DataView(out.buffer);
  d.setUint8(4, VERSION);
  d.setUint8(5, packet.type);
  d.setUint16(6, body.byteLength, true);
  d.setUint32(8, packet.matchId, true);
  d.setUint32(12, packet.seq, true);
  out.set(body, HEADER_BYTES);
  return out;
}
export function decodePacket(raw, { expectedMatchId = null } = {}) {
  const data = readBytes(raw);
  if (data.byteLength < HEADER_BYTES || data.byteLength > MAX_PACKET_BYTES)
    throw new RangeError('bad packet size');
  const d = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (MAGIC.some((v, i) => d.getUint8(i) !== v)) throw new Error('bad packet magic');
  if (d.getUint8(4) !== VERSION) throw new Error('unsupported protocol version');
  const type = d.getUint8(5);
  if (!VALID_TYPES.has(type)) throw new Error('unknown packet type');
  const length = d.getUint16(6, true);
  if (data.byteLength !== HEADER_BYTES + length) throw new Error('packet length mismatch');
  const matchId = d.getUint32(8, true), seq = d.getUint32(12, true);
  if (!matchId || (expectedMatchId !== null && matchId !== expectedMatchId))
    throw new Error('match identity mismatch');
  const o = { version: VERSION, type, matchId, seq };
  const p = new DataView(data.buffer, data.byteOffset + HEADER_BYTES, length);
  const need = n => { if (length !== n) throw new Error('unexpected payload size'); };
  switch (type) {
    case PacketType.HELLO:
      need(5);
      o.role = p.getUint8(0);
      o.configFingerprint = p.getUint32(1, true);
      integer(o.role, 'role', 0, 1);
      break;
    case PacketType.INPUT:
      need(5);
      o.frame = p.getUint32(0, true);
      o.mask = p.getUint8(4);
      integer(o.frame, 'frame', 0, MAX_FRAME);
      integer(o.mask, 'mask', 0, 0x7f);
      break;
    case PacketType.INPUT_ACK:
      need(8);
      o.through = p.getInt32(0, true);
      o.bitmap = p.getUint32(4, true);
      integer(o.through, 'through', -1, MAX_FRAME);
      break;
    case PacketType.RESEND_REQUEST: {
      if (length < 5) throw new Error('request too short');
      const n = p.getUint8(0);
      if (n < 1 || n > 8 || length !== 1 + n * 4)
        throw new Error('invalid request count/size');
      const seen = new Set();
      o.frames = [];
      for (let i = 0; i < n; i++) {
        const frame = p.getUint32(1 + 4 * i, true);
        integer(frame, 'requested frame', 0, MAX_FRAME);
        if (seen.has(frame)) throw new Error('duplicate request frame');
        seen.add(frame); o.frames.push(frame);
      }
      break;
    }
    case PacketType.FRAME_HASH:
      need(8);
      o.frame = p.getUint32(0, true);
      o.hash = p.getUint32(4, true);
      integer(o.frame, 'frame', 0, MAX_FRAME);
      break;
    case PacketType.HELLO_ACK:
      need(0);
      break;
    case PacketType.MATCH_ABORT:
      need(1);
      o.reason = p.getUint8(0);
      if (!VALID_REASONS.has(o.reason)) throw new Error('invalid abort reason');
      break;
  }
  return o;
}
