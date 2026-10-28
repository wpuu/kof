import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodePacket, decodePacket, PacketType as P, AbortReason, HEADER_BYTES,
  MAX_PACKET_BYTES
} from '../src/netcode/v2_protocol.mjs';
import { ReliableInputPeer } from '../src/netcode/v2_reliability.mjs';

const MATCH_ID = 0x12345678;
const mk = (type, rest = {}) =>
  encodePacket({ type, matchId: MATCH_ID, seq: 3, ...rest });

function peers(overrides = {}) {
  const common = { matchId: MATCH_ID, configFingerprint: 0xabc01234, ...overrides };
  const a = new ReliableInputPeer({ ...common, role: 0 });
  const b = new ReliableInputPeer({ ...common, role: 1 });
  assert.equal(a.receive(b.hello()).accepted, true);
  assert.equal(b.receive(a.hello()).accepted, true);
  return [a, b];
}

test('V2 codec roundtrips all bounded message types', () => {
  const samples = [
    mk(P.HELLO, { role: 1, configFingerprint: 0xffffffff }),
    mk(P.INPUT, { frame: 1948, mask: 127 }),
    mk(P.INPUT_ACK, { through: -1, bitmap: 0x80000001 }),
    mk(P.RESEND_REQUEST, { frames: [0, 3, 7, 11, 12] }),
    mk(P.FRAME_HASH, { frame: 99, hash: 0xfedcba98 }),
    mk(P.MATCH_ABORT, { reason: AbortReason.UNRECOVERABLE_INPUT }),
    mk(P.HELLO_ACK)
  ];
  for (const sample of samples) {
    assert.deepEqual(
      decodePacket(sample, { expectedMatchId: MATCH_ID }),
      decodePacket(sample.buffer, { expectedMatchId: MATCH_ID })
    );
    assert.equal(decodePacket(sample).version, 2);
    assert.equal(sample.length <= MAX_PACKET_BYTES, true);
  }
  assert.equal(mk(P.INPUT, { frame: 0, mask: 0 }).length, HEADER_BYTES + 5);
});

test('V2 rejects bad magic, version, truncated and padded packets', () => {
  const packet = mk(P.INPUT, { frame: 5, mask: 12 });
  const tamperedMagic = packet.slice(); tamperedMagic[0] ^= 255;
  const wrongVersion = packet.slice(); wrongVersion[4] = 1;
  const wrongPayloadLength = packet.slice(); wrongPayloadLength[6] = 1;
  const wrongMask = packet.slice(); wrongMask[HEADER_BYTES + 4] = 255;
  assert.throws(() => decodePacket(tamperedMagic), /magic/);
  assert.throws(() => decodePacket(wrongVersion), /version/);
  assert.throws(() => decodePacket(wrongPayloadLength), /length/);
  assert.throws(() => decodePacket(packet.subarray(0, packet.length - 1)), /length/);
  assert.throws(() => decodePacket(new Uint8Array([...packet, 0])), /length/);
  assert.throws(() => decodePacket(wrongMask), /mask/);
  assert.throws(() => decodePacket(packet, { expectedMatchId: 4 }), /identity/);
  assert.throws(() => decodePacket(new Uint8Array(300)), /size/);
  assert.throws(() => decodePacket('malformed'), /ArrayBuffer/);
});

test('V2 validates input, resend, handshake and ACK limits', () => {
  assert.throws(() => mk(P.INPUT, { frame: -1, mask: 1 }), /frame/);
  assert.throws(() => mk(P.INPUT, { frame: 1, mask: 128 }), /mask/);
  assert.throws(() => mk(P.RESEND_REQUEST, { frames: [] }), /request/);
  assert.throws(() => mk(P.RESEND_REQUEST, { frames: Array.from({ length: 9 }, (_, i) => i) }), /request/);
  assert.throws(() => mk(P.RESEND_REQUEST, { frames: [2, 2] }), /duplicate/);
  assert.throws(() => mk(P.INPUT_ACK, { through: -2, bitmap: 0 }), /through/);
  assert.throws(() => mk(P.HELLO, { role: 3, configFingerprint: 4 }), /role/);
  const corrupt = mk(P.RESEND_REQUEST, { frames: [2, 3] }).slice();
  corrupt[HEADER_BYTES] = 7;
  assert.throws(() => decodePacket(corrupt), /request count/);
});

test('V2 peers require correct HELLO and matching config', () => {
  const wrong = new ReliableInputPeer({
    matchId: MATCH_ID, role: 0, configFingerprint: 12
  });
  const other = new ReliableInputPeer({
    matchId: MATCH_ID, role: 1, configFingerprint: 13
  });
  const r = wrong.receive(other.hello());
  assert.equal(r.type, 'abort');
  assert.equal(decodePacket(r.packet).reason, AbortReason.VERSION_MISMATCH);
  assert.equal(wrong.aborted, true);
  const solo = new ReliableInputPeer({
    matchId: MATCH_ID, role: 0, configFingerprint: 13
  });
  assert.throws(() => solo.receive(mk(P.INPUT, { frame: 0, mask: 1 })), /HELLO/);
});

test('Normal input stream produces contiguous ACK progress and bounded wire format', () => {
  const [a, b] = peers();
  for (let frame = 0; frame < 60; frame++) {
    const pkt = a.sendInput(frame, frame % 8);
    assert.equal(pkt.length, 21);
    const input = b.receive(pkt, { currentSimFrame: frame });
    assert.equal(input.type, 'input');
    assert.equal(input.confirmedThrough, frame);
    assert.equal(a.receive(input.ack).type, 'ack');
  }
  assert.equal(b.confirmedThrough, 59);
  assert.equal(a.sent.size, 0);
  assert.equal(b.received.size, 60);
});

test('Out-of-order input ACK bitmap identifies holes without mistaking later frames for contiguous', () => {
  const [a, b] = peers();
  const raw = Array.from({ length: 12 }, (_, frame) => a.sendInput(frame, frame % 4));
  for (const i of [0, 1, 2, 5, 7]) {
    const event = b.receive(raw[i], { currentSimFrame: 0 });
    a.receive(event.ack);
  }
  assert.equal(b.confirmedThrough, 2);
  const ack = decodePacket(b.makeAck());
  assert.equal(ack.through, 2);
  assert.equal(ack.bitmap & 0b10100, 0b10100); // offsets 2 (frame5), 4 (frame7)
  assert.deepEqual(Array.from(a.sent.keys()).slice(0, 8), [3, 4, 6, 8, 9, 10, 11]);
});

test('Single and five-consecutive missing INPUT packets recover through bounded NACK/resend', () => {
  for (const lost of [[4], [4, 5, 6, 7, 8]]) {
    const [a, b] = peers();
    const sent = [];
    for (let frame = 0; frame < 24; frame++) sent.push(a.sendInput(frame, frame % 7));
    for (let frame = 0; frame < sent.length; frame++) {
      if (lost.includes(frame)) continue;
      const ev = b.receive(sent[frame], { currentSimFrame: 0 });
      a.receive(ev.ack);
    }
    assert.equal(b.confirmedThrough, 3);
    const req = b.makeMissingRequest(200);
    assert.deepEqual(decodePacket(req).frames, lost);
    assert.equal(b.makeMissingRequest(201), null, 'cooldown suppresses duplicate requests');
    const retransmitted = a.receive(req);
    assert.equal(retransmitted.type, 'resend');
    assert.equal(retransmitted.packets.length, lost.length);
    // Delivery order may differ; later frames already known by receiver.
    for (const pkt of retransmitted.packets.reverse()) {
      const ev = b.receive(pkt, { currentSimFrame: 0 });
      a.receive(ev.ack);
    }
    assert.equal(b.confirmedThrough, 23);
    assert.equal(b.makeMissingRequest(500), null);
    assert.equal(a.sent.size, 0);
    assert.equal(b.metrics.received, 24);
    assert.equal(b.checkSafety(24).ok, true);
  }
});

test('Duplicate mismatching INPUT causes safe abort, never silently overwrites confirmed history', () => {
  const [a, b] = peers();
  b.receive(a.sendInput(0, 1));
  const corrupt = mk(P.INPUT, { frame: 0, mask: 2 });
  const r = b.receive(corrupt);
  assert.equal(r.type, 'abort');
  assert.equal(decodePacket(r.packet).reason, AbortReason.DESYNC);
  assert.equal(b.aborted, true);
});

test('Unrecoverable missing history fails closed before trusted game settlement', () => {
  const [a, b] = peers();
  b.receive(a.sendInput(0, 0));
  b.receive(a.sendInput(10, 1), { currentSimFrame: 2 });
  const safety = b.checkSafety(19);
  assert.equal(safety.ok, false);
  assert.equal(decodePacket(safety.packet).reason, AbortReason.UNRECOVERABLE_INPUT);
  assert.equal(b.aborted, true);
  assert.throws(() => b.sendInput(20, 1), /aborted/);
});

test('Missing resend history and excessive requests never trigger silently trusted outcome', () => {
  const [a, b] = peers({ historyLimit: 40, resendLimit: 2 });
  for (let i = 0; i < 42; i++) a.sendInput(i, 1);
  const result = a.receive(mk(P.RESEND_REQUEST, { frames: [0] }));
  assert.equal(result.type, 'abort');
  assert.deepEqual(result.missing, [0]);
  assert.equal(a.aborted, true);
  assert.equal(b.aborted, false);
});

test('Far-future frame is rejected without filling a sparse frame array', () => {
  const [a, b] = peers({ maxFutureFrames: 64 });
  assert.throws(() => b.receive(mk(P.INPUT, { frame: 1_000_000, mask: 1 }),
    { currentSimFrame: 0 }), /future/);
  assert.equal(b.received.size, 0);
});

test('Repeated NACK requests are bounded by resend limit', () => {
  const [a, b] = peers({ resendLimit: 2 });
  a.sendInput(0, 1);
  const request = mk(P.RESEND_REQUEST, { frames: [0] });
  assert.equal(a.receive(request).type, 'resend');
  assert.equal(a.receive(request).type, 'resend');
  assert.equal(a.receive(request).type, 'abort');
  assert.equal(a.aborted, true);
});

test('Cumulative ACK + bitmap is unsigned at high bit and cannot ACK missing history', () => {
  const [a, b] = peers();
  for (let f = 0; f < 35; f++) a.sendInput(f, 2);
  // ACK through -1 but only the 32nd selective bit: frame 31.
  const ack = mk(P.INPUT_ACK, { through: -1, bitmap: 0x80000000 });
  const result = a.receive(ack);
  assert.equal(result.acked, 1);
  assert.equal(a.sent.has(31), false);
  assert.equal(a.sent.has(0), true);
  assert.equal(a.sent.has(32), true);
});

test('No returned network result should imply a financial payout or gameplay safety', () => {
  const [a, b] = peers();
  assert.equal(a.handshakeComplete && b.handshakeComplete, true);
  assert.equal(typeof b.checkSafety(0).ok, 'boolean');
  // Codec/reliability only. Game loop and result settlement integration absent.
  assert.equal('winnerId' in b, false);
  assert.equal('wallet' in a, false);
});

test('Forged future cumulative ACK cannot erase retransmission buffer', () => {
  const [a] = peers();
  for (let f = 0; f < 8; f++) a.sendInput(f, 1);
  const got = a.receive(mk(P.INPUT_ACK, { through: 9999, bitmap: 0 }));
  assert.equal(got.type, 'abort');
  assert.equal(got.detail, 'ACK beyond transmitted frame');
  assert.equal(a.sent.size, 8);
  assert.equal(a.aborted, true);
});

test('Forged selective ACK on an unsent future frame cannot erase retransmission buffer', () => {
  const [a] = peers();
  for (let f = 0; f < 8; f++) a.sendInput(f, 1);
  // through 0, 8th offset corresponds to frame 8 which is not yet sent.
  const got = a.receive(mk(P.INPUT_ACK, { through: 0, bitmap: 1 << 7 }));
  assert.equal(got.type, 'abort');
  assert.equal(got.detail, 'selective ACK beyond transmitted frame');
  assert.equal(a.sent.size, 8);
});

test('Invalid match ID on incoming packet never changes confirmed inputs', () => {
  const [a, b] = peers();
  assert.throws(
    () => b.receive(encodePacket({
      type: P.INPUT, matchId: MATCH_ID + 1, seq: 2, frame: 0, mask: 1
    })),
    /identity/
  );
  assert.equal(b.received.size, 0);
  assert.equal(b.metrics.invalid, 1);
});

test('Simulated 90ms one-way lag + four lost frames aborts safely before trusted result', () => {
  // 60Hz simulation: 90ms ~= 6 frame delivery delay. This is a virtual model,
  // NOT actual Chrome P2P and NOT proof of responsiveness.
  const [a, b] = peers({ rollbackWindow: 8 });
  const messages = Array.from({ length: 25 }, (_, frame) =>
    a.sendInput(frame, frame === 4 ? 1 : 0));
  let abortAt = null;
  for (let tick = 0; tick < 25; tick++) {
    const sentFrame = tick - 6;
    if (sentFrame >= 0 && ![4, 5, 6, 7].includes(sentFrame)) {
      b.receive(messages[sentFrame], { currentSimFrame: tick });
    }
    const status = b.checkSafety(tick);
    if (!status.ok) {
      abortAt = tick;
      assert.equal(decodePacket(status.packet).reason, AbortReason.UNRECOVERABLE_INPUT);
      break;
    }
  }
  assert.notEqual(abortAt, null, 'critical history gap is not silently ignored');
  assert.ok(abortAt <= 15, 'unsafe frame causes prompt fail-closed state');
  assert.equal(b.aborted, true);
});

test('V2 HELLO_ACK is a strictly empty, typed message and never grants early readiness', () => {
  const ack = mk(P.HELLO_ACK);
  assert.equal(ack.byteLength, HEADER_BYTES);
  assert.equal(decodePacket(ack).type, P.HELLO_ACK);
  const padded = new Uint8Array([...ack, 0]);
  assert.throws(() => decodePacket(padded), /length/);
  const source = new ReliableInputPeer({
    matchId: MATCH_ID, role: 0, configFingerprint: 12
  });
  assert.throws(() => source.receive(ack), /HELLO required/);
  const sender = new ReliableInputPeer({
    matchId: MATCH_ID, role: 1, configFingerprint: 12
  });
  assert.equal(source.receive(sender.hello()).accepted, true);
  assert.equal(source.receive(ack).type, 'hello_ack');
});
