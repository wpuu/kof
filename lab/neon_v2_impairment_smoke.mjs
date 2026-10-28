/**
 * P0-012 same-runner two-browser gameplay impairment trial for the V2 bridge.
 * Unlike the early V1 probe, faults target actual V2 kof-v2-input Uint8Array
 * packet payloads (KOF2 header + frame/mask) rather than the old 9-byte format.
 * PASS means CONSISTENT or that BOTH peers explicitly VOIDED; a VOID
 * is not a playable or low-latency success.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const url = process.env.NEON_URL || 'http://127.0.0.1:18789/';
const delay = Number(process.env.V2_ONE_WAY_SEND_DELAY_MS || 0);
const drop = Number(process.env.V2_DROP_NONZERO_FRAMES || 0);
if (!Number.isInteger(delay) || delay < 0 || delay > 180 ||
    !Number.isInteger(drop) || drop < 0 || drop > 12)
  throw new Error('Invalid bounded impairment settings');

const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function until(label, f, timeoutMs=36000) {
  const t=Date.now();
  while (Date.now()-t<timeoutMs) {
    const ok=await f();
    if(ok)return ok;
    await sleep(130);
  }
  throw new Error('Timeout: '+label);
}
const snapshot = page=>page.evaluate(()=>({
  frame:NEON.Game.frame,phase:NEON.Game.phase,
  voided:NEON.Net.voided,voidReason:NEON.Net.voidReason,
  voidDetail:String(NEON.Net.voidDetail||'').slice(0,120),
  active:NEON.Net.active,remoteFrame:NEON.Net.remoteFrame,
  role:NEON.Net.role,
  p1x:Number(NEON.P1.x.toFixed(4)),
  p2x:Number(NEON.P2.x.toFixed(4)),
  hash:NEON.hashGameState(NEON.Game,NEON.P1,NEON.P2),
  rb:NEON.DEBUG.rb,
  network:NEON.Net.v2Metrics
}));
async function prepare(browser, isHost) {
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  await context.addInitScript(({delay,drop,isHost})=>{
    const original=RTCDataChannel.prototype.send;
    const faults=window.__v2Faults={sent:0,dropped:0,delayed:0,firstLostFrame:null};
    RTCDataChannel.prototype.send=function(value){
      const data=value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : ArrayBuffer.isView(value)
          ? new Uint8Array(value.buffer,value.byteOffset,value.byteLength)
          : null;
      if(this.label!=='kof-v2-input' || !data || data.length!==21 ||
         data[0]!==0x4b || data[1]!==0x4f || data[2]!==0x46 ||
         data[3]!==0x32 || data[5]!==2) {
        return original.call(this,value);
      }
      const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
      const frame=view.getUint32(16,true),mask=view.getUint8(20);
      faults.sent++;
      const immutable=data.slice();
      if(isHost && drop && mask!==0 && faults.dropped<drop) {
        faults.dropped++;
        if(faults.firstLostFrame===null)faults.firstLostFrame=frame;
        return; // synthetic loss solely for host movement inputs
      }
      if(delay) {
        const channel=this;
        faults.delayed++;
        setTimeout(()=>{
          if(channel.readyState==='open')original.call(channel,immutable);
        },delay);
      } else return original.call(this,immutable);
    };
  },{delay,drop,isHost});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.name+':'+e.message.slice(0,120)));
  await page.route(url,async route=>{
    const response=await route.fetch();
    const text=await response.text();
    const needle="iceServers:[{urls:'stun:stun.l.google.com:19302'}]";
    if(!text.includes(needle))throw new Error('Pinned ICE test override anchor not found');
    await route.fulfill({response,body:text.replace(needle,'iceServers:[]')});
  });
  await page.goto(url,{waitUntil:'load'});
  await until('Neon engine boot',()=>page.evaluate(()=>
    !!window.NEON && !!document.getElementById('boot')?.classList.contains('ready')));
  await page.locator('#start').click();
  await page.locator('#tNet').click();
  return {context,page,errors};
}
async function signal(host,guest) {
  const a=host.page,b=guest.page;
  await b.locator('#nJoin').click();
  await a.locator('#nHost').click();
  const offer=await until('host V2 offer',async()=>{
    const s=await a.locator('#netout').inputValue();
    return s.length>100?s:null;
  });
  await b.locator('#netin').fill(offer);
  await b.locator('#nAccept').click();
  const answer=await until('guest V2 answer',async()=>{
    const s=await b.locator('#netout').inputValue();
    return s.length>100?s:null;
  });
  await a.locator('#netin').fill(answer);
  await a.locator('#nAccept').click();
  await until('game intro and real V2 transport for both',async()=>{
    const [x,y]=await Promise.all([snapshot(a),snapshot(b)]);
    if(x.voided||y.voided)throw new Error('V2 aborted during setup: '+
      JSON.stringify([x.voidDetail,y.voidDetail]));
    return x.active&&y.active&&x.phase==='fight'&&y.phase==='fight'&&
      x.remoteFrame>20&&y.remoteFrame>20;
  });
}
async function pauseAtSameFrame(a,b) {
  const [x,y]=await Promise.all([snapshot(a),snapshot(b)]);
  const target=Math.max(x.frame,y.frame)+60;
  const freeze=p=>p.evaluate(target=>new Promise(resolve=>{
    function step(){
      if(NEON.Net.voided){
        resolve({voided:true,frame:NEON.Game.frame});
        return;
      }
      if(NEON.Game.frame>=target){
        NEON.Game.paused=true;
        resolve({voided:false,frame:NEON.Game.frame});
        return;
      }
      requestAnimationFrame(step);
    }
    step();
  }),target);
  const out=await Promise.all([freeze(a),freeze(b)]);
  const [a1,b1]=await Promise.all([snapshot(a),snapshot(b)]);
  return {target,freeze:out,a:a1,b:b1,
    exactFrame:a1.frame===b1.frame,
    equalHash:a1.frame===b1.frame&&a1.hash===b1.hash};
}
let browser,host,guest;
try {
  browser=await chromium.launch({
    headless:true,
    ...(existsSync('/usr/bin/google-chrome')
      ? {executablePath:'/usr/bin/google-chrome'} : {}),
    args:['--no-sandbox','--disable-dev-shm-usage']
  });
  host=await prepare(browser,true);
  guest=await prepare(browser,false);
  await signal(host,guest);
  await host.page.keyboard.down('d');
  await sleep(550);
  await host.page.keyboard.up('d');
  await guest.page.keyboard.down('a');
  await sleep(550);
  await guest.page.keyboard.up('a');
  await sleep(800);
  const result=await pauseAtSameFrame(host.page,guest.page);
  const dropEvidence=await host.page.evaluate(()=>({...window.__v2Faults}));
  if(dropEvidence.dropped!==drop)
    throw new Error('Fault injector did not drop the requested number of V2 INPUT packets');
  if(host.errors.length||guest.errors.length)
    throw new Error('Browser JS errors: '+JSON.stringify([...host.errors,...guest.errors]));
  const bothVoid=result.a.voided && result.b.voided;
  const partialVoid=result.a.voided !== result.b.voided;
  const outcome=bothVoid ? 'SAFE_VOID_UNVERIFIED'
    : partialVoid ? 'UNSAFE_PARTIAL_ABORT'
    : result.equalHash ? 'CONSISTENT' : 'UNSAFE_DESYNC';
  const output={outcome,sendDelayMs:delay,lossCount:drop,dropEvidence,
    exactFrame:result.exactFrame,equalHash:result.equalHash,
    peers:[result.a,result.b],
    scope:'two Chromium pages on same CI runner, synthetic delay on INPUT only, reliable CTRL unaffected'};
  console.log(JSON.stringify(output,null,2));
  if(outcome==='UNSAFE_DESYNC'||outcome==='UNSAFE_PARTIAL_ABORT')
    throw new Error(outcome+' — do not count as match success');
} catch(e) {
  console.error('P0 V2 IMPAIRMENT FAIL: '+e.message);
  for(const [label,v] of [['host',host],['guest',guest]]){
    if(!v)continue;
    const x=await snapshot(v.page).catch(()=>null);
    console.error(label+': '+JSON.stringify(x));
  }
  process.exitCode=1;
} finally {
  if(host)await host.context.close().catch(()=>{});
  if(guest)await guest.context.close().catch(()=>{});
  if(browser)await browser.close().catch(()=>{});
}
