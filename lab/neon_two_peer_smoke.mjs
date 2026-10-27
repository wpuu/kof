/**
 * P0-005 real two-peer gameplay integration smoke.
 * Two distinct Chromium browsing contexts run the actual pinned Neon Fist
 * game and connect via WebRTC DataChannel after manual UI SDP exchange.
 * ICE config is host-only only for this isolated same-runner test.
 * NOT a mobile device, true ISP network, or quality/anti-cheat certification.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const gameURL = process.env.NEON_URL || 'http://127.0.0.1:18789/';
// Exploratory additive DataChannel send delay (both directions).
// The original 9-byte gameplay buffers are recycled each frame, so copy each
// ArrayBuffer before delaying it; otherwise this instrument would corrupt data.
const transportDelayMs = Number(process.env.NEON_SEND_DELAY_MS || '0');
const dropFirstHostNonzero = process.env.NEON_DROP_FIRST_NONZERO === 'host';
const dropBurstCount = Number(process.env.NEON_DROP_BURST_COUNT || '1');
if (!Number.isInteger(dropBurstCount) || dropBurstCount < 1 || dropBurstCount > 8) {
  throw new Error('NEON_DROP_BURST_COUNT must be 1..8');
}
const expectDesync = process.env.NEON_EXPECT_DESYNC === '1';
if (expectDesync && !dropFirstHostNonzero) throw new Error('Expected-desync mode requires host drop fault');

if (!Number.isInteger(transportDelayMs) || transportDelayMs < 0 || transportDelayMs > 200) {
  throw new Error('NEON_SEND_DELAY_MS must be an integer in 0..200');
}
async function configureSimulatedDelay(context, shouldDrop) {
  if (!transportDelayMs && !shouldDrop) return;
  await context.addInitScript(({ ms, drop, burst }) => {
    const originalSend = RTCDataChannel.prototype.send;
    window.__p0FaultCounters = {
      gameplaySent: 0, dropped: 0, droppedFrame: null, firstDroppedFrame: null
    };
    RTCDataChannel.prototype.send = function (buffer) {
      if (buffer instanceof ArrayBuffer && buffer.byteLength >= 9 &&
          buffer.byteLength <= 64 && this.label === 'fight') {
        const immutable = buffer.slice(0);
        const view = new DataView(immutable);
        const mask = view.getUint8(4);
        window.__p0FaultCounters.gameplaySent++;
        if (drop && mask !== 0 && window.__p0FaultCounters.dropped < burst) {
          if (!window.__p0FaultCounters.dropped)
            window.__p0FaultCounters.firstDroppedFrame = view.getInt32(0, true);
          window.__p0FaultCounters.dropped++;
          window.__p0FaultCounters.droppedFrame = view.getInt32(0, true);
          return; // simulate bounded consecutive input packet loss
        }
        if (ms) {
          const channel = this;
          setTimeout(() => {
            if (channel.readyState === 'open') originalSend.call(channel, immutable);
          }, ms);
          return;
        }
        return originalSend.call(this, immutable);
      }
      return originalSend.call(this, buffer);
    };
  }, { ms: transportDelayMs, drop: !!shouldDrop, burst: dropBurstCount });
}

const executablePath = process.env.CHROME_BIN ||
  (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const sleep = n => new Promise(r => setTimeout(r, n));
async function until(label, fn, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const hit = await fn();
    if (hit) return hit;
    await sleep(140);
  }
  throw new Error('Timeout: ' + label);
}
const sample = page => page.evaluate(() => ({
  frame: NEON.Game.frame, phase: NEON.Game.phase,
  p1x: Number(NEON.P1.x.toFixed(2)),
  p2x: Number(NEON.P2.x.toFixed(2)),
  p1hp: NEON.P1.hp, p2hp: NEON.P2.hp,
  remoteFrame: NEON.Net.remoteFrame, rollbackCount: NEON.DEBUG.rb,
  netRole: NEON.Net.role, active: NEON.Net.active,
  hash: NEON.hashGameState(NEON.Game, NEON.P1, NEON.P2)
}));
async function checkpointAtSameFrame(pageA, pageB) {
  const getFrame = page => page.evaluate(() => NEON.Game.frame);
  const [frameA, frameB] = await Promise.all([getFrame(pageA), getFrame(pageB)]);
  const target = Math.max(frameA, frameB) + 75;
  const pause = (page) => page.evaluate(targetFrame => new Promise(resolve => {
    const step = () => {
      if (NEON.Game.frame >= targetFrame) {
        NEON.Game.paused = true;
        resolve({
          frame: NEON.Game.frame,
          p1x: Number(NEON.P1.x.toFixed(4)),
          p2x: Number(NEON.P2.x.toFixed(4)),
          p1hp: NEON.P1.hp, p2hp: NEON.P2.hp,
          timer: NEON.Game.timer, phase: NEON.Game.phase,
          hash: NEON.hashGameState(NEON.Game, NEON.P1, NEON.P2),
          rollbackCount: NEON.DEBUG.rb
        });
      } else {
        requestAnimationFrame(step);
      }
    };
    step();
  }), target);
  const [a, b] = await Promise.all([pause(pageA), pause(pageB)]);
  const sameFrame = a.frame === b.frame;
  return {
    targetFrame: target, sameFrame, hashMatch: sameFrame ? a.hash === b.hash : null,
    a, b
  };
}

function assertSignal(signal, type) {
  const parsed = JSON.parse(Buffer.from(signal, 'base64').toString('utf8'));
  if (parsed.type !== type || !parsed.sdp || typeof parsed.sdp !== 'string')
    throw new Error(type + ' SDP is invalid');
}
async function prepare(context) {
  const page = await context.newPage();
  // Do not depend on Google STUN access for this local host-only experiment.
  // This route only changes the ICE servers in the test response; the
  // pinned upstream repository and committed files are not changed.
  await page.route(gameURL, async route => {
    const upstream = await route.fetch();
    const html = await upstream.text();
    const needle = "iceServers:[{urls:'stun:stun.l.google.com:19302'}]";
    if (!html.includes(needle)) throw new Error('ICE test patch anchor absent');
    await route.fulfill({ response: upstream,
      body: html.replace(needle, 'iceServers:[]') });
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const response = await page.goto(gameURL, { waitUntil: 'load' });
  if (response?.status() !== 200) throw new Error('Game HTTP ' + response?.status());
  await until('game engine boot', () =>
    page.evaluate(() => !!window.NEON &&
      document.getElementById('boot')?.classList.contains('ready')));
  await page.locator('#start').click();
  await page.locator('#tNet').click();
  return { page, errors };
}
async function testCase(browser, { name, guestTouch }) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctxB = await browser.newContext(guestTouch
    ? { viewport: { width: 390, height: 844 }, isMobile: true,
        hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 720 } });
  let host, guest;
  try {
    await Promise.all([
      configureSimulatedDelay(ctxA, dropFirstHostNonzero),
      configureSimulatedDelay(ctxB, false)
    ]);
    [host, guest] = await Promise.all([prepare(ctxA), prepare(ctxB)]);
    const a = host.page, b = guest.page;
    await b.locator('#nJoin').click();
    await a.locator('#nHost').click();
    const offer = await until('host offer', async () => {
      const v = await a.locator('#netout').inputValue();
      return v.length > 100 ? v : null;
    });
    assertSignal(offer, 'offer');
    await b.locator('#netin').fill(offer);
    await b.locator('#nAccept').click();
    const answer = await until('guest answer', async () => {
      const v = await b.locator('#netout').inputValue();
      return v.length > 100 ? v : null;
    });
    assertSignal(answer, 'answer');
    await a.locator('#netin').fill(answer);
    await a.locator('#nAccept').click();
    await until('both browser game channels open', async () => {
      const [x, y] = await Promise.all([sample(a), sample(b)]);
      return x.active && y.active && x.netRole === 'host' &&
        y.netRole === 'guest' && x.remoteFrame > 15 &&
        y.remoteFrame > 15 && x.phase === 'fight' && y.phase === 'fight';
    }, 26000);
    const before = await Promise.all([sample(a), sample(b)]);
    // HOST uses own P1 controls; remote GUEST should observe P1 moving right.
    const hostMoveKey = dropFirstHostNonzero ? 'a' : 'd';
    await a.keyboard.down(hostMoveKey);
    await sleep(550);
    await a.keyboard.up(hostMoveKey);
    await sleep(250);
    const afterHost = await Promise.all([sample(a), sample(b)]);
    if (!dropFirstHostNonzero
      ? (afterHost[0].p1x < before[0].p1x + 15 ||
         afterHost[1].p1x < before[1].p1x + 15)
      : (afterHost[0].p1x > before[0].p1x - 15 ||
         afterHost[1].p1x > before[1].p1x - 15)) {
      throw new Error('P1 movement not reflected on both browser game states');
    }

    // GUEST uses the P1 local input mapping, but controls player P2 in netplay.
    // Optionally exercise touch on the emulated mobile guest.
    const guestMoveKey = dropFirstHostNonzero ? 'd' : 'a';
    if (!guestTouch) {
      await b.keyboard.down(guestMoveKey);
      await sleep(500);
      await b.keyboard.up(guestMoveKey);
    } else {
      const el = b.locator(dropFirstHostNonzero
        ? '[data-k="right"]' : '[data-k="left"]');
      const rect = await el.boundingBox();
      if (!rect) throw new Error('Mobile touch control not visible');
      const cdp = await ctxB.newCDPSession(b);
      const x = Math.round(rect.x + rect.width / 2);
      const y = Math.round(rect.y + rect.height / 2);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart', touchPoints: [{ x, y }]
      });
      await sleep(500);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchEnd', touchPoints: []
      });
      await cdp.detach();
    }
    await sleep(300);
    const afterGuest = await Promise.all([sample(a), sample(b)]);
    if (!dropFirstHostNonzero
      ? (afterGuest[0].p2x > afterHost[0].p2x - 15 ||
         afterGuest[1].p2x > afterHost[1].p2x - 15)
      : (afterGuest[0].p2x < afterHost[0].p2x + 15 ||
         afterGuest[1].p2x < afterHost[1].p2x + 15)) {
      throw new Error('P2 movement not reflected on both browser game states');
    }
    if (!afterGuest.every(s => s.remoteFrame > 20 && s.active)) {
      throw new Error('A remote peer stopped receiving input');
    }
    if (host.errors.length || guest.errors.length) {
      throw new Error('Uncaught game error in a browser: ' +
        [...host.errors, ...guest.errors].slice(0, 4).join('; ').slice(0, 700));
    }
    // Stop both game loops when they reach the same future simulation frame.
    // A hash mismatch is meaningful only when frame numbers also match.
    // No inputs are held during this quiet settle period.
    const synchronized = await checkpointAtSameFrame(a, b);
    const faultInfo = await a.evaluate(() => window.__p0FaultCounters || null);
    if (dropFirstHostNonzero && faultInfo?.dropped !== dropBurstCount) {
      throw new Error('Test invalid: expected ' + dropBurstCount +
        ' nonzero host packets to be dropped, observed ' + faultInfo?.dropped);
    }
    if (expectDesync) {
      if (!synchronized.sameFrame) {
        throw new Error('Inconclusive fault test: unable to sample exact same frame');
      }
      if (synchronized.hashMatch) {
        throw new Error('Expected divergence not observed; inspect resilience or dropped frame');
      }
    } else if (synchronized.sameFrame && !synchronized.hashMatch) {
      throw new Error('Confirmed game-state hash mismatch at same simulation frame: ' +
        synchronized.targetFrame);
    }
    return {
      case: name,
      result: expectDesync ? 'EXPECTED_DESYNC_REPRODUCED' : 'PASS',
      verified: ['two independent browser contexts exchange actual SDP',
        'both WebRTC DataChannels open', 'both receive remote game input frames',
        'host P1 movement is observed by both clients',
        'guest P2 movement is observed by both clients'],
      before, afterHost, afterGuest,
      sameFrameCheckpoint: synchronized,
      faultInfo: faultInfo ? {
        gameplaySent: faultInfo.gameplaySent,
        dropped: faultInfo.dropped,
        firstDroppedFrame: faultInfo.firstDroppedFrame,
        lastDroppedFrame: faultInfo.droppedFrame
      } : null,
      absolutePlayerPositionDelta: {
        p1: Number(Math.abs(afterGuest[0].p1x - afterGuest[1].p1x).toFixed(2)),
        p2: Number(Math.abs(afterGuest[0].p2x - afterGuest[1].p2x).toFixed(2))
      },
      differentFrameWarning: afterGuest[0].frame !== afterGuest[1].frame,
      hashMatchAtUnsynchronizedSamples: afterGuest[0].hash === afterGuest[1].hash,
      network: 'same CI host, ICE host-only; no STUN/TURN or ISP crossing',
      artificialSendDelayMsPerDirection: transportDelayMs,
      observedRollbacks: [afterGuest[0].rollbackCount, afterGuest[1].rollbackCount],
      mobile: guestTouch ? 'Chromium touchscreen emulation, not Android/iOS hardware'
        : 'desktop Chromium'
    };
  } catch (error) {
    const state = [];
    for (const item of [host, guest]) {
      if (!item?.page || item.page.isClosed()) { state.push(null); continue; }
      const s = await item.page.evaluate(() => ({
        netRole: window.NEON?.Net?.role,
        active: window.NEON?.Net?.active,
        remoteFrame: window.NEON?.Net?.remoteFrame,
        frame: window.NEON?.Game?.frame,
        phase: window.NEON?.Game?.phase,
        p1: window.NEON?.P1?.x, p2: window.NEON?.P2?.x,
        status: document.getElementById('netstat')?.textContent?.slice(0, 140)
      })).catch(() => null);
      state.push(s);
    }
    console.error(JSON.stringify({
      case: name, result: 'FAIL', error: String(error.message),
      states: state,
      pageErrors: [host?.errors?.slice(0, 3), guest?.errors?.slice(0, 3)]
    }));
    throw error;
  } finally {
    await Promise.all([ctxA.close(), ctxB.close()]);
  }
}

let browser;
try {
  browser = await chromium.launch({
    headless: true, ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const cases = [
    { name: 'desktop-vs-desktop', guestTouch: false },
    { name: 'desktop-vs-touchscreen-emulation', guestTouch: true }
  ];
  const results = [];
  for (const c of cases) results.push(await testCase(browser, c));
  console.log(JSON.stringify({
    status: expectDesync ? 'EXPECTED_DESYNC_REPRODUCED' : 'PASS',
    scope: 'actual game between two independent Chromium contexts on one CI host',
    intentionalHostPacketLoss: dropFirstHostNonzero,
    intentionalHostPacketLossCount: dropFirstHostNonzero ? dropBurstCount : 0,
    artificialSendDelayMsPerDirection: transportDelayMs,
    chromeVersion: browser.version(), results,
    notVerified: ['real devices', 'cross-city/cross-carrier',
      'natural RTT jitter/packet-loss rollback quality',
      'same-frame post-rollback state agreement',
      'copyright/payment/production security']
  }, null, 2));
} catch (e) {
  console.error('Two-peer browser game smoke FAILED: ' + e.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
}
