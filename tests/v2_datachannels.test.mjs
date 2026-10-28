import test from 'node:test';
import assert from 'node:assert/strict';
import { createV2ChannelSession, FAST_LABEL, CONTROL_LABEL } from '../src/netcode/v2_datachannels.mjs';
import { decodePacket, PacketType, AbortReason } from '../src/netcode/v2_protocol.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class FakeChannel {
  constructor(label, options) {
    this.label = label; this.options = options;
    this.readyState = 'connecting'; this.bufferedAmount = 0;
    this.partner = null; this.onopen = null; this.onmessage = null;
    this.onclose = null; this.onerror = null;
    this.sentPackets = [];
    this.dropPredicate = null;
  }
  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
  send(buffer) {
    if (this.readyState !== 'open') throw new Error('channel not open');
    const data = new Uint8Array(buffer).slice();
    this.sentPackets.push(data);
    if (this.dropPredicate?.(data)) return;
    queueMicrotask(() => {
      if (this.partner?.readyState === 'open')
        this.partner.onmessage?.({ data: data.buffer });
    });
  }
  close() {
    this.readyState = 'closed';
    this.onclose?.();
  }
}
function makeLinkedPCs() {
  const guest = { ondatachannel: null, createDataChannel() {
    throw new Error('guest must not create channel');
  }};
  const host = { createDataChannel(label, options) {
    const a = new FakeChannel(label, options);
    const b = new FakeChannel(label, options);
    a.partner = b; b.partner = a;
    queueMicrotask(() => {
      guest.ondatachannel?.({ channel: b });
      b.open(); a.open();
    });
    return a;
  }};
  return [host, guest];
}
async function linkedSessions(opts = {}) {
  const [hostPC, guestPC] = makeLinkedPCs();
  const frame = { a: 0, b: 0 };
  const received = { a: new Map(), b: new Map() };
  const aborts = { a: [], b: [] };
  const ready = { a: 0, b: 0 };
  const defaults = {
    matchId: 0x778899, configFingerprint: 0xabc987,
    requestCooldownMs: 1, rollbackWindow: 8
  };
  const a = createV2ChannelSession({
    ...defaults, ...opts, pc: hostPC, role: 0,
    currentFrame: () => frame.a,
    onInput: (f, m) => received.a.set(f, m),
    onReady: () => ready.a++,
    onAbort: info => aborts.a.push(info)
  });
  const b = createV2ChannelSession({
    ...defaults, ...opts, pc: guestPC, role: 1,
    currentFrame: () => frame.b,
    onInput: (f, m) => received.b.set(f, m),
    onReady: () => ready.b++,
    onAbort: info => aborts.b.push(info)
  });
  await sleep(5);
  return { a, b, frame, received, aborts, ready };
}
test('V2 adapter opens distinct ordered reliable control and unordered fast channels', async () => {
  const { a, b, ready } = await linkedSessions();
  assert.equal(a.ready, true);
  assert.equal(b.ready, true);
  assert.deepEqual(ready, { a: 1, b: 1 });
  assert.equal(a.fastChannel.label, FAST_LABEL);
  assert.equal(a.controlChannel.label, CONTROL_LABEL);
  assert.equal(a.fastChannel.options.ordered, false);
  assert.equal(a.fastChannel.options.maxRetransmits, 0);
  assert.equal(a.controlChannel.options.ordered, true);
  a.close(); b.close();
});
test('V2 dual-channel roundtrip delivers bidirectional frame input and cumulative ACK', async () => {
  const { a, b, received, frame } = await linkedSessions();
  for (let f = 0; f < 12; f++) {
    frame.a = frame.b = f;
    assert.equal(a.sendInput(f, (f % 3)), true);
    assert.equal(b.sendInput(f, (f + 3) % 4), true);
    await sleep(0);
    assert.equal(a.tick(f, f * 16), true);
    assert.equal(b.tick(f, f * 16), true);
  }
  await sleep(10);
  assert.equal(a.peer.sent.size, 0);
  assert.equal(b.peer.sent.size, 0);
  assert.equal(received.a.size, 12);
  assert.equal(received.b.size, 12);
  assert.equal(a.metrics.acksSent > 0 && b.metrics.acksSent > 0, true);
  a.close(); b.close();
});
test('V2 missing fast input frame is recovered on reliable control after NACK', async () => {
  const { a, b, received, frame } = await linkedSessions();
  let dropped = 0;
  a.fastChannel.dropPredicate = buf => {
    const p = decodePacket(buf);
    if (!dropped && p.type === PacketType.INPUT && p.frame === 4) {
      dropped++; return true;
    }
    return false;
  };
  for (let f = 0; f < 10; f++) {
    frame.a = frame.b = f;
    a.sendInput(f, f % 5);
    await sleep(0);
  }
  assert.equal(dropped, 1);
  assert.equal(received.b.has(4), false);
  frame.a = frame.b = 10;
  assert.equal(b.tick(10, 500), true);
  await sleep(5);
  assert.equal(received.b.get(4), 4);
  assert.equal(b.peer.confirmedThrough, 9);
  assert.equal(b.metrics.missingRequestsSent > 0, true);
  assert.equal(a.metrics.resendPacketsSent, 1);
  assert.equal(b.aborted, null);
  a.close(); b.close();
});
test('V2 multi-frame loss recovers within rollback window when NACK is delivered promptly', async () => {
  const { a, b, received, frame } = await linkedSessions({ rollbackWindow: 8 });
  a.fastChannel.dropPredicate = buf => {
    const f = decodePacket(buf).frame;
    return f >= 3 && f <= 7;
  };
  for (let f = 0; f < 12; f++) {
    frame.a = frame.b = 0; // intentionally simulated no timeline advancement
    a.sendInput(f, f % 6);
    await sleep(0);
  }
  assert.equal(b.tick(8, 200), true);
  await sleep(8);
  for (let f = 3; f <= 7; f++) assert.equal(received.b.get(f), f % 6);
  assert.equal(b.peer.confirmedThrough, 11);
  assert.equal(a.metrics.resendPacketsSent, 5);
  assert.equal(b.aborted, null);
  a.close(); b.close();
});
test('V2 out-of-window loss raises abort and prevents trusted game input sending', async () => {
  const { a, b, aborts, frame } = await linkedSessions({ rollbackWindow: 8 });
  a.fastChannel.dropPredicate = buf => decodePacket(buf).frame === 3;
  for (let f = 0; f < 12; f++) {
    a.sendInput(f, f % 4);
    await sleep(0);
  }
  frame.a = frame.b = 13;
  assert.equal(b.tick(13, 200), false);
  assert.equal(b.aborted.reason, AbortReason.UNRECOVERABLE_INPUT);
  assert.equal(aborts.b.length, 1);
  assert.equal(b.sendInput(12, 0), false);
  await sleep(5);
  assert.equal(a.aborted.reason, AbortReason.UNRECOVERABLE_INPUT);
  a.close(); b.close();
});
test('V2 malformed binary and unexpected message are fail-closed', async () => {
  const { a, b, aborts } = await linkedSessions();
  a.fastChannel.send(new Uint8Array([0, 1, 2]));
  await sleep(5);
  assert.equal(b.aborted.reason, AbortReason.MALFORMED);
  assert.equal(aborts.b.length, 1);
  assert.equal(b.ready, false);
  a.close(); b.close();
});
test('V2 no duplicate handshake ready notifications and explicit close is not abort', async () => {
  const { a, b, ready, aborts } = await linkedSessions();
  await sleep(15);
  assert.deepEqual(ready, { a: 1, b: 1 });
  a.close(); b.close();
  assert.deepEqual(aborts, { a: [], b: [] });
});

test('V2 adapter exchanges explicit HELLO_ACK on reliable control before gameplay', async () => {
  const { a, b, ready } = await linkedSessions();
  const aPackets = a.controlChannel.sentPackets.map(x => decodePacket(x));
  const bPackets = b.controlChannel.sentPackets.map(x => decodePacket(x));
  assert.ok(aPackets.some(p => p.type === PacketType.HELLO));
  assert.ok(bPackets.some(p => p.type === PacketType.HELLO));
  assert.ok(aPackets.some(p => p.type === PacketType.HELLO_ACK));
  assert.ok(bPackets.some(p => p.type === PacketType.HELLO_ACK));
  assert.equal(a.ready, true);
  assert.equal(b.ready, true);
  assert.deepEqual(ready, { a: 1, b: 1 });
  a.close(); b.close();
});
