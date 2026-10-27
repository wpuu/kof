/**
 * Actual Chromium WebRTC test of V2 two-channel INPUT / ACK / RESEND.
 * No game engine, no real phone, no STUN/TURN or WAN. CI localhost only.
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const pages = {
  '/': ['text/html; charset=utf-8',
    '<!doctype html><meta charset="utf-8"><title>P0 V2 WebRTC</title>'],
  '/src/netcode/v2_datachannels.mjs': ['text/javascript; charset=utf-8',
    readFileSync(resolve(root, 'src/netcode/v2_datachannels.mjs'))],
  '/src/netcode/v2_protocol.mjs': ['text/javascript; charset=utf-8',
    readFileSync(resolve(root, 'src/netcode/v2_protocol.mjs'))],
  '/src/netcode/v2_reliability.mjs': ['text/javascript; charset=utf-8',
    readFileSync(resolve(root, 'src/netcode/v2_reliability.mjs'))]
};
const server = http.createServer((request, response) => {
  const page = pages[request.url];
  if (!page) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': page[0], 'Cache-Control': 'no-store' });
  response.end(page[1]);
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(label, fn, maxMs = 15000) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    const x = await fn();
    if (x) return x;
    await sleep(100);
  }
  throw new Error('timeout: ' + label);
}
async function gather(page) {
  return page.evaluate(async () => {
    if (window.pc.iceGatheringState !== 'complete')
      await new Promise(resolve => {
        const p = window.pc;
        const on = () => {
          if (p.iceGatheringState !== 'complete') return;
          p.removeEventListener('icegatheringstatechange', on);
          resolve();
        };
        p.addEventListener('icegatheringstatechange', on);
      });
    return window.pc.localDescription.toJSON();
  });
}
async function createPair(browser, url, name) {
  const aContext = await browser.newContext();
  const bContext = await browser.newContext();
  const a = await aContext.newPage();
  const b = await bContext.newPage();
  const errors = [];
  for (const page of [a,b]) {
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
  }
  for (const [page,role] of [[a,0],[b,1]]) {
    await page.evaluate(async role => {
      const { createV2ChannelSession } =
        await import('/src/netcode/v2_datachannels.mjs');
      window.pc = new RTCPeerConnection({ iceServers: [] });
      window.inputs = [];
      window.abortReports = [];
      window.readyCount = 0;
      window.simFrame = 0;
      window.session = createV2ChannelSession({
        pc: window.pc, role, matchId: 0x19871123,
        configFingerprint: 0x0a0b0c0d,
        currentFrame: () => window.simFrame,
        onInput: (frame, mask) => window.inputs.push({ frame, mask }),
        onReady: () => window.readyCount++,
        onAbort: info => window.abortReports.push(info),
        requestCooldownMs: 2
      });
    }, role);
  }
  const offer = await a.evaluate(async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return true;
  });
  if (!offer) throw new Error('host offer failed');
  const offerJson = await gather(a);
  await b.evaluate(async desc => {
    await pc.setRemoteDescription(desc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
  }, offerJson);
  const answerJson = await gather(b);
  await a.evaluate(desc => pc.setRemoteDescription(desc), answerJson);
  await until('V2 game channel handshake', async () => {
    const [x,y] = await Promise.all([
      a.evaluate(() => session.ready),
      b.evaluate(() => session.ready)
    ]);
    return x && y;
  });
  return { a, b, name, errors, async close() {
    await Promise.all([aContext.close(), bContext.close()]);
  }};
}
async function testLoss(pair, lostFrames) {
  const { a, b } = pair;
  await a.evaluate(lost => {
    window.dropStats = { dropped: 0, frames: [] };
    const channel = window.session.fastChannel;
    const original = channel.send.bind(channel);
    channel.send = bytes => {
      const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const frame = data.getUint32(16, true);
      if (lost.includes(frame)) {
        window.dropStats.dropped++;
        window.dropStats.frames.push(frame);
        return;
      }
      return original(bytes);
    };
  }, lostFrames);
  for (let frame = 0; frame <= 13; frame++) {
    const sent = await a.evaluate(f => {
      simFrame = f;
      return session.sendInput(f, f % 8);
    }, frame);
    if (!sent) throw new Error('host send failed at frame ' + frame);
    // This rate is for protocol correctness, not simulated frame timing.
    await sleep(12);
  }
  const before = await b.evaluate(() => ({
    received: inputs.map(x => x.frame),
    through: session.peer.confirmedThrough
  }));
  if (lostFrames.some(f => before.received.includes(f)))
    throw new Error('a dropped input unexpectedly arrived by fast transport');
  const tick = await b.evaluate(() => {
    simFrame = 11;
    return session.tick(11, 2000);
  });
  if (!tick) throw new Error('resend request aborted despite recoverable gap');
  await until('requested frames arrive via reliable control', async () =>
    b.evaluate(expected => expected.every(frame =>
      inputs.some(x => x.frame === frame)), lostFrames));
  await sleep(50);
  const after = await b.evaluate(() => ({
    seen: inputs.map(x => x.frame),
    through: session.peer.confirmedThrough,
    ready: session.ready, aborted: session.aborted,
    metrics: { ...session.metrics }
  }));
  const sending = await a.evaluate(() => ({
    remainingUnacked: session.peer.sent.size,
    metrics: { ...session.metrics },
    dropStats
  }));
  if (after.through !== 13 || after.aborted ||
      sending.dropStats.dropped !== lostFrames.length ||
      sending.metrics.resendPacketsSent !== lostFrames.length)
    throw new Error('ACK/NACK/resend verification failed');
  if (pair.errors.length) throw new Error('Page JavaScript errors');
  return {
    variant: pair.name, delivered: 14, lost: lostFrames.length,
    missingBeforeResend: lostFrames,
    confirmedThrough: after.through,
    resent: sending.metrics.resendPacketsSent,
    acks: after.metrics.acksSent,
    doubleChannels: true,
    actualBrowserWebRTC: true
  };
}
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const chrome = existsSync('/usr/bin/google-chrome')
    ? '/usr/bin/google-chrome' : undefined;
  browser = await chromium.launch({
    headless: true, ...(chrome ? { executablePath: chrome } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const results = [];
  for (const [name, lost] of [
    ['single-fast-input-loss', [4]],
    ['five-fast-input-loss', [4,5,6,7,8]]
  ]) {
    const pair = await createPair(browser,url,name);
    try { results.push(await testLoss(pair,lost)); }
    finally { await pair.close(); }
  }
  console.log(JSON.stringify({ result:'PASS',
    platform:'Chromium ' + browser.version(), results,
    limits: ['not actual game', 'no WAN', 'no NAT traversal', 'no mobile hardware',
      'not production identity or anti-cheat validation']
  },null,2));
} catch (error) {
  console.error('P0 V2 BROWSER TEST FAIL: ' + error.message);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(()=>{});
  await new Promise(resolve => server.close(resolve));
}
