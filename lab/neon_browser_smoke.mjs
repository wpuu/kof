/**
 * Isolated browser smoke for upstream Neon Fist pinned at c28ffb7.
 * No game ROM, payment, production accounts or public services.
 * desktop Chromium + mobile-emulated Chromium are NOT physical phone tests.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const endpoint = process.env.NEON_URL || 'http://127.0.0.1:18789/';
const browserPath = process.env.CHROME_BIN ||
  (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(description, fn, timeoutMs = 32000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(160);
  }
  throw new Error('Timeout: ' + description);
}

let browser;
const outcomes = [];
try {
  browser = await chromium.launch({
    headless: true,
    ...(browserPath ? { executablePath: browserPath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const cases = [
    { name: 'desktop-Chromium', config: { viewport: { width: 1280, height: 720 } }, touch: false },
    { name: 'mobile-emulation-Chromium', config: { viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2, isMobile: true, hasTouch: true }, touch: true }
  ];
  for (const specimen of cases) {
    const context = await browser.newContext(specimen.config);
    const page = await context.newPage();
    const jsErrors = [];
    page.on('pageerror', e => jsErrors.push(e.message));
    try {
      const response = await page.goto(endpoint, { waitUntil: 'load' });
      if (response?.status() !== 200) throw new Error('HTML HTTP ' + response?.status());
      await until('NEON engine boot (' + specimen.name + ')', async () =>
        page.evaluate(() => !!window.NEON && document.getElementById('boot')?.classList.contains('ready')));
      const initial = await page.evaluate(() => ({
        frame: NEON.Game.frame,
        playerX: NEON.P1.x,
        phase: NEON.Game.phase,
        canvasWidth: document.getElementById('game').width,
        canvasHeight: document.getElementById('game').height,
        config: NEON.configVersion
      }));
      if (!initial.canvasWidth || !initial.canvasHeight) throw new Error('Canvas has zero dimensions');
      await page.locator('#start').click();
      const progressed = await until('game frame progression', async () => {
        const value = await page.evaluate(() => NEON.Game.frame);
        return value > initial.frame + 12 ? value : null;
      });
      await until('match fight phase', async () =>
        page.evaluate(() => NEON.Game.phase === 'fight'), 22000);
      const before = await page.evaluate(() => ({ frame: NEON.Game.frame, x: NEON.P1.x }));
      if (!specimen.touch) {
        await page.keyboard.down('d');
        await sleep(500);
        await page.keyboard.up('d');
      } else {
        const rect = await page.locator('[data-k="right"]').boundingBox();
        if (!rect) throw new Error('Mobile touch D-pad element not found');
        const cdp = await context.newCDPSession(page);
        const x = Math.round(rect.x + rect.width / 2);
        const y = Math.round(rect.y + rect.height / 2);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await sleep(500);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      }
      const after = await page.evaluate(() => ({
        frame: NEON.Game.frame, x: NEON.P1.x, fps: NEON.DEBUG.fps, phase: NEON.Game.phase
      }));
      if (after.frame <= before.frame + 3) throw new Error('Game loop stopped');
      if (after.x <= before.x + 2) throw new Error('Player failed to respond to ' +
        (specimen.touch ? 'emulated touch' : 'keyboard') + ' input, x=' + before.x + '→' + after.x);
      if (jsErrors.length) throw new Error('JS runtime error: ' + jsErrors.join(' / ').slice(0, 600));
      outcomes.push({
        case: specimen.name, result: 'PASS', initial, before, after,
        simulatedTouch: specimen.touch, frameProgression: progressed
      });
      if (!specimen.touch) {
        await page.locator('#tNet').click();
        await page.locator('#nLocal').click();
        const netReady = await until('in-page WebRTC rollback loopback active',
          async () => page.evaluate(() => NEON.Net.active), 18000);
        await sleep(900);
        const rollback = await page.evaluate(() => ({
          netActive: NEON.Net.active,
          remoteFrame: NEON.Net.remoteFrame,
          rollbacks: NEON.DEBUG.rb,
          gameFrame: NEON.Game.frame
        }));
        if (!rollback.netActive || rollback.remoteFrame < 0) {
          throw new Error('Loopback network active without remote inputs');
        }
        outcomes.push({ case: 'local-loopback-90ms', result: 'PASS', netReady, rollback });
      }
    } catch (e) {
      // Never print SDP, IP addresses, credentials or raw HTTP response bodies.
      const safeState = await page.evaluate(() => ({
        loading: document.getElementById('loading')?.textContent?.slice(0, 160),
        status: document.getElementById('netstat')?.textContent?.slice(0, 160),
        hasNeon: !!window.NEON,
        gameFrame: window.NEON?.Game?.frame ?? -1
      })).catch(() => null);
      console.error(JSON.stringify({ case: specimen.name, result: 'FAIL',
        message: e.message, state: safeState, errors: jsErrors.slice(0, 3) }));
      throw e;
    } finally {
      await context.close();
    }
  }
  console.log(JSON.stringify({
    result: 'PASS',
    scope: 'Headless desktop Chromium and emulated touch in GitHub Actions',
    browserVersion: browser.version(),
    outcomes,
    notVerified: [
      'real Android or Safari iOS hardware', 'cross-network P2P/NAT/TURN',
      'competitive play quality', 'production security', 'copyright and paid operation'
    ]
  }, null, 2));
} catch (e) {
  console.error('Neon game browser smoke FAILED: ' + e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
