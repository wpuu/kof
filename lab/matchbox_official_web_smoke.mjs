/**
 * Browser-only P0-012 proof of the official Matchbox Bevy/GGRS WASM example.
 * Two distinct Chromium processes, self-hosted Matchbox signaling on localhost.
 * This verifies actual room-join logs and animated canvas initialization;
 * it is NOT a real mobile, carrier-NAT, latency or anti-cheat benchmark.
 */
import { chromium } from 'playwright';

const base = process.env.MATCHBOX_WEB_URL || 'http://127.0.0.1:1334/';
const gameUrl = new URL(base);
gameUrl.searchParams.set('players', '2');
gameUrl.searchParams.set('matchbox', 'ws://127.0.0.1:3536');

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function eventually(label, predicate, timeoutMs = 70000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await sleep(300);
  }
  throw new Error('timeout: ' + label);
}
async function launchPlayer(label) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--enable-webgl']
  });
  const context = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const page = await context.newPage();
  const logs = [];
  const errors = [];
  page.on('console', msg => {
    const t = msg.text();
    // Never emit candidate/SDP or other raw signaling internals.
    if (/all peers have joined|entering lobby|waiting for|connecting to matchbox server|GGRS Event|rollback/i.test(t))
      logs.push(t.slice(0, 180));
  });
  page.on('pageerror', e => errors.push(e.name + ': ' + e.message.slice(0, 200)));
  page.on('requestfailed', request => {
    // Only record resource path, no query or sensitive signaling data.
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('.wasm') || pathname.endsWith('.js')) errors.push('failed resource: '+pathname);
  });
  await page.goto(gameUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
  return { label, browser, context, page, logs, errors };
}
const seenGame = player => player.logs.some(x => /all peers have joined/i.test(x));
const status = async p => ({
  label: p.label,
  bootstrap: await p.page.evaluate(() => ({
    state: window.__kofTestBootStatus || null,
    hasCanvas: !!document.querySelector('canvas'),
    canvasWidth: document.querySelector('canvas')?.width || 0,
    canvasHeight: document.querySelector('canvas')?.height || 0
  })).catch(() => ({ unavailable: true })),
  joinedGame: seenGame(p),
  relevantLogs: p.logs.slice(-8),
  errors: p.errors.slice(0, 5)
});
let a, b;
try {
  [a,b] = await Promise.all([launchPlayer('host'),launchPlayer('guest')]);
  await eventually('both WASM games load an active canvas', async () => {
    const [x,y] = await Promise.all([status(a), status(b)]);
    if ([x,y].some(q => q.bootstrap?.state?.startsWith('error'))) {
      throw new Error('WASM JS initialization error: '+JSON.stringify([x,y]));
    }
    return [x,y].every(q => q.bootstrap?.hasCanvas &&
      q.bootstrap?.canvasWidth > 0 && q.bootstrap?.canvasHeight > 0);
  });
  await eventually('both players join same GGRS game room', async () =>
    seenGame(a) && seenGame(b));
  await a.page.bringToFront();
  await a.page.keyboard.down('w');
  await sleep(350);
  await a.page.keyboard.up('w');
  await b.page.bringToFront();
  await b.page.keyboard.down('d');
  await sleep(350);
  await b.page.keyboard.up('d');
  if (a.errors.length || b.errors.length) throw new Error('page runtime/resource errors');
  const result = [await status(a), await status(b)];
  console.log(JSON.stringify({
    result: 'PASS',
    source: 'pinned official Matchbox Bevy/GGRS WASM example',
    claim: 'both independent Chrome processes initialized canvas and joined same local self-hosted GGRS game',
    results: result,
    remaining: ['validate exact state hashes','cross-network STUN/TURN','phone hardware','sustained 20-match gameplay',
      'latency/jitter/loss measurement', 'game rights & business approvals']
  }, null, 2));
} catch(e) {
  console.error('P0-012 OFFICIAL WEB E2E FAIL: '+e.message);
  for (const player of [a,b]) if (player) {
    try {console.error(JSON.stringify(await status(player)));} catch {}
  }
  process.exitCode=1;
} finally {
  await Promise.all([a,b].filter(Boolean).map(p => p.browser.close().catch(()=>{})));
}
