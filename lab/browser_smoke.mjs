/**
 * P0 browser runtime smoke test for the standalone KOF P2P probe.
 * Two independent Chromium pages exchange SDP inside the CI runner.
 * This verifies the DOM/WebRTC handshake and DataChannel RTT reporting,
 * NOT real cross-carrier NAT traversal, phone performance or game rollback.
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const html = readFileSync(new URL('./p2p_probe.html', import.meta.url));
const serve = http.createServer((req, res) => {
  if (req.url !== '/p2p_probe.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(html);
});

async function until(description, fn, timeoutMs = 35000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 175));
  }
  throw new Error('Timed out: ' + description);
}

function parseTypedSignal(value, type) {
  const s = JSON.parse(value);
  if (s.type !== type || typeof s.sdp !== 'string' || !s.sdp) {
    throw new Error('Invalid ' + type + ' signal');
  }
  return s;
}

let browser;
try {
  await new Promise((resolve, reject) => {
    serve.once('error', reject);
    serve.listen(0, '127.0.0.1', resolve);
  });
  const address = serve.address();
  const url = 'http://127.0.0.1:' + address.port + '/p2p_probe.html';
  const chromePath = process.env.CHROME_BIN ||
    (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : null);
  browser = await chromium.launch({
    headless: true,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  const errors = [];
  for (const page of [a, b]) {
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load' });
    if (!(await page.evaluate(() => 'RTCPeerConnection' in window))) {
      throw new Error('RTCPeerConnection missing in Chromium');
    }
    // Local host-only ICE avoids relying on a Google STUN server in CI.
    // Real internet/carrier tests must use STUN/TURN separately.
    await page.locator('#stun').fill('');
  }
  await a.locator('#makeOffer').click();
  const offerJson = await until('offer', async () => {
    const s = await a.locator('#local').inputValue();
    return s.includes('"type":"offer"') ? s : null;
  });
  parseTypedSignal(offerJson, 'offer');
  await b.locator('#remote').fill(offerJson);
  await b.locator('#makeAnswer').click();
  const answerJson = await until('answer', async () => {
    const s = await b.locator('#local').inputValue();
    return s.includes('"type":"answer"') ? s : null;
  });
  parseTypedSignal(answerJson, 'answer');
  await a.locator('#remote').fill(answerJson);
  await a.locator('#applyAnswer').click();

  await until('A open DataChannel', async () =>
    (await a.locator('#state').textContent()).includes('DataChannel open'));
  await until('B open DataChannel', async () =>
    (await b.locator('#state').textContent()).includes('DataChannel open'));
  const metrics = await until('RTT samples on both peers', async () => {
    const x = await a.locator('#metrics').textContent();
    const y = await b.locator('#metrics').textContent();
    return /采样发送: [1-9]\d* \| 返回: [1-9]\d*/.test(x) &&
      /采样发送: [1-9]\d* \| 返回: [1-9]\d*/.test(y) &&
      /最近 RTT p50: \d+ ms/.test(x) ? { a: x, b: y } : null;
  }, 12000);
  if (errors.length) throw new Error('Unexpected page JS error: ' + errors.join('; '));

  // Sanitize: don't print or upload SDP/ICE addresses.
  console.log(JSON.stringify({
    result: 'PASS',
    scope: 'Two Chromium browser contexts on one GitHub runner, host-only ICE',
    chromeVersion: browser.version(),
    offerBytes: offerJson.length,
    answerBytes: answerJson.length,
    aMetrics: metrics.a.replace(/候选对: .+/, '候选对: [redacted]'),
    bMetrics: metrics.b.replace(/候选对: .+/, '候选对: [redacted]'),
    outOfScope: ['actual mobile devices', 'different carrier networks', 'TURN relay', 'gameplay/rollback'],
  }, null, 2));
  await a.locator('#close').click();
  await b.locator('#close').click();
  await contextA.close();
  await contextB.close();
} catch (error) {
  console.error('P0 browser smoke FAIL: ' + error.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  await new Promise(resolve => serve.close(resolve));
}
