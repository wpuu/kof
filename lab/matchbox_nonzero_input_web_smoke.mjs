/**
 * P0-013D: real nonzero Rust game input enables synthetic WebRTC loss; 90ms+jitter and frame-state agreement
 * after real two-browser keyboard inputs in the pinned Bevy/GGRS example.
 * Rust test-only instrumentation reports frame, positions and velocities
 * in sorted player-handle order at each 30th simulation frame.
 * This is NOT a KOF ROM benchmark or cross-architecture proof.
 */
import { chromium } from 'playwright';

const base=process.env.MATCHBOX_WEB_URL || 'http://127.0.0.1:1334/';
const url=new URL(base);
url.searchParams.set('players','2');
url.searchParams.set('matchbox','ws://127.0.0.1:3536');
const delayMs=Number(process.env.GGRS_EXTRA_SEND_DELAY_MS||'90');
const burst=Number(process.env.GGRS_DROP_FIRST_BURST||'5');
const jitterMs=Number(process.env.GGRS_JITTER_MAX_MS||'20');
const repetition=Number(process.env.GGRS_REPETITION||'1');
if(!Number.isInteger(delayMs)||delayMs<0||delayMs>150||
   !Number.isInteger(burst)||burst<1||burst>8||
   !Number.isInteger(jitterMs)||jitterMs<0||jitterMs>50||
   !Number.isInteger(repetition)||repetition<1||repetition>100)
  throw new Error('Invalid bounded 90ms+loss+jitter test env');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(description,fn,timeoutMs=90000){
  const t=Date.now();
  while(Date.now()-t<timeoutMs){
    if(await fn())return;
    await sleep(250);
  }
  throw new Error('timeout: '+description);
}
function decode(positions) {
  const found=[...positions.matchAll(/\((\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\)/g)];
  if(found.length!==2)throw new Error('Expected exactly two rollback player component records');
  const entries=found.map(m=>({id:Number(m[1]),x:Number(m[2]),z:Number(m[3]),
    vx:Number(m[4]),vz:Number(m[5])}));
  if(entries[0].id!==0||entries[1].id!==1)throw new Error('Wrong player handle ordering');
  return entries;
}
async function launch(label){
  const browser=await chromium.launch({
    headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage',
      '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--enable-webgl']
  });
  const context=await browser.newContext({viewport:{width:960,height:640}});
  await context.addInitScript(({delayMs,burst,jitterMs,repetition,label})=>{
    const original=RTCDataChannel.prototype.send;
    window.__ggrsImpairmentEnabled=false;
    window.__ggrsImpairmentLabel=label;
    const local=window.__p0Inputs={
      localNonzeroCount:0,
      firstLocal:null,
      lastLocal:null,
      localSamples:[],
      appliedByHandle:{'0':0,'1':0},
      firstApplied:{},
      lastApplied:{}
    };
    const metrics=window.__ggrsImpairment={
      attempted:0,dropped:0,delayed:0,forwarded:0,channelLabels:[],
      armedAfterNonzero:false,armedFrame:null,armedMask:null,
      jitterSamples:0,minJitterMs:null,maxJitterMs:null
    };
    let seed=(Math.imul(repetition,2654435761)+(label==='A'?113:991))>>>0;
    window.__kofCiLocalInput=(handle,frame,mask)=>{
      if(!Number.isInteger(mask)||mask===0)return;
      const event={handle,frame,mask};
      local.localNonzeroCount++;
      if(local.firstLocal===null)local.firstLocal=event;
      local.lastLocal=event;
      if(local.localSamples.length<8)local.localSamples.push(event);
      // Synchronous WASM -> window hook guarantees P0's loss arm only
      // follows real nonzero LOCAL input capture by the game engine.
      if(label==='A'&&!window.__ggrsImpairmentEnabled){
        window.__ggrsImpairmentEnabled=true;
        metrics.armedAfterNonzero=true;
        metrics.armedFrame=frame;
        metrics.armedMask=mask;
      }
    };
    window.__kofCiAppliedInput=(handle,frame,mask)=>{
      if(!Number.isInteger(mask)||mask===0)return;
      const key=String(handle);
      local.appliedByHandle[key]=(local.appliedByHandle[key]||0)+1;
      if(!(key in local.firstApplied))local.firstApplied[key]={frame,mask};
      local.lastApplied[key]={frame,mask};
    };
    RTCDataChannel.prototype.send=function(data){
      // The official GGRS socket uses unordered unreliable gameplay channel.
      // Do not touch WebSocket signaling or reliable browser channels.
      if(this.ordered!==false||this.maxRetransmits!==0||
         !window.__ggrsImpairmentEnabled)
        return original.call(this,data);
      if(!metrics.channelLabels.includes(this.label))
        metrics.channelLabels.push(this.label.slice(0,48));
      let bytes=null;
      if(data instanceof ArrayBuffer)bytes=new Uint8Array(data).slice();
      else if(ArrayBuffer.isView(data))
        bytes=new Uint8Array(data.buffer,data.byteOffset,data.byteLength).slice();
      else return original.call(this,data);
      metrics.attempted++;
      if(label==='A'&&metrics.dropped<burst){
        metrics.dropped++;
        return;
      }
      const channel=this;
      if(delayMs||jitterMs){
        metrics.delayed++;
        seed=(Math.imul(seed,1664525)+1013904223)>>>0;
        const jitter=jitterMs ? (seed % (2*jitterMs+1))-jitterMs : 0;
        metrics.jitterSamples++;
        metrics.minJitterMs=metrics.minJitterMs===null
          ? jitter : Math.min(metrics.minJitterMs,jitter);
        metrics.maxJitterMs=metrics.maxJitterMs===null
          ? jitter : Math.max(metrics.maxJitterMs,jitter);
        setTimeout(()=>{
          if(channel.readyState==='open'){
            original.call(channel,bytes);
            metrics.forwarded++;
          }
        },Math.max(0,delayMs+jitter));
      }else{
        metrics.forwarded++;
        return original.call(this,bytes);
      }
    };
  },{delayMs,burst,jitterMs,repetition,label});
  const page=await context.newPage();
  const snapshots=new Map();
  const errors=[], httpFailures=[];
  let generic404Errors=0;
  let joined=false, fontLoaded=false;
  page.on('response',response=>{
    const path=new URL(response.url()).pathname;
    const status=response.status();
    if(path==='/assets/fonts/quicksand-light.ttf'&&status>=200&&status<300)
      fontLoaded=true;
    if(status<400)return;
    httpFailures.push({status,path});
  });
  page.on('requestfailed',request=>{
    // Network failure for a required resource is always an error.
    const path=new URL(request.url()).pathname;
    if(/\.(wasm|js|ttf|png|woff2?)$/i.test(path))
      errors.push('network request failed: '+path);
  });
  page.on('console',msg=>{
    const txt=msg.text();
    if(/All peers have joined, going in-game/.test(txt))joined=true;
    const found=/KOF_CI_STATE frame=(\d+) state=(\[[^\]\r\n]*\])/.exec(txt);
    if(found)snapshots.set(Number(found[1]),found[2]);
    if(msg.type()==='error') {
      if(/Failed to load resource:.*404/.test(txt))generic404Errors++;
      else errors.push(txt.slice(0,180));
    }
  });
  page.on('pageerror',e=>errors.push(e.name+':'+e.message.slice(0,160)));
  await page.goto(url.toString(),{waitUntil:'domcontentloaded',timeout:45000});
  return {label,browser,context,page,snapshots,errors,httpFailures,
    get fontLoaded(){return fontLoaded;},
    get generic404Errors(){return generic404Errors;},get joined(){return joined;}};
}
function maxFrame(p){return Math.max(-1,...p.snapshots.keys());}
let a,b;
try{
  [a,b]=await Promise.all([launch('A'),launch('B')]);
  await until('both peers in-game with actual rollback component snapshots',
    ()=>a.joined&&b.joined&&maxFrame(a)>=90&&maxFrame(b)>=90);
  const baselineFrame=Math.min(maxFrame(a),maxFrame(b));
  const startA=decode(a.snapshots.get(baselineFrame)??a.snapshots.get(maxFrame(a)));
  const startB=decode(b.snapshots.get(baselineFrame)??b.snapshots.get(maxFrame(b)));
  // Guest delay starts now. Host loss/delay starts only after a synchronous
  // Rust WASM hook confirms its first real, nonzero LOCAL movement input.
  await b.page.evaluate(()=>{window.__ggrsImpairmentEnabled=true;});
  await a.page.bringToFront();
  await a.page.keyboard.down('w');
  await until('host captured a nonzero local input',()=>
    a.page.evaluate(()=>window.__p0Inputs.localNonzeroCount>0),15000);
  await sleep(900);
  await a.page.keyboard.up('w');
  await b.page.bringToFront();
  await b.page.keyboard.down('d');
  await until('guest captured a nonzero local input',()=>
    b.page.evaluate(()=>window.__p0Inputs.localNonzeroCount>0),15000);
  await sleep(900);
  await b.page.keyboard.up('d');
  await until('both games progressed >60 simulated frames beyond inputs',()=>
    maxFrame(a)>=baselineFrame+120&&maxFrame(b)>=baselineFrame+120);
  const common=[...a.snapshots.keys()]
    .filter(frame=>b.snapshots.has(frame)&&frame>=baselineFrame+60&&
      frame<=Math.min(maxFrame(a),maxFrame(b))-30)
    .sort((a,b)=>b-a);
  if(!common.length)throw new Error('No common confirmed-state checkpoint after inputs');
  const frame=common[0];
  const stateA=a.snapshots.get(frame),stateB=b.snapshots.get(frame);
  const aligned=stateA===stateB;
  const after=decode(stateA);
  const p0Moved=Math.abs(after[0].x-startA[0].x)>50 ||
    Math.abs(after[0].z-startA[0].z)>50;
  const p1Moved=Math.abs(after[1].x-startB[1].x)>50 ||
    Math.abs(after[1].z-startB[1].z)>50;
  if(!p0Moved||!p1Moved)
    throw new Error('Input did not produce observable movement for both handles');
  const faults=await Promise.all([a.page,b.page].map(p=>
    p.evaluate(()=>({...window.__ggrsImpairment}))));
  const captured=await Promise.all([a.page,b.page].map(p=>
    p.evaluate(()=>JSON.parse(JSON.stringify(window.__p0Inputs)))));
  if(captured.some(c=>c.localNonzeroCount===0)||
     captured.some(c=>c.appliedByHandle['0']<1||c.appliedByHandle['1']<1))
    throw new Error('One player local-input capture or remote GGRS applied-input hook missing');
  if(!faults[0].armedAfterNonzero||faults[0].armedFrame===null||
     faults[0].armedMask===0)
    throw new Error('Fault injection armed before real nonzero local game input');
  if(faults[0].dropped!==burst)
    throw new Error('Invalid fault case: requested '+burst+
      ' dropped input packets but actually dropped '+faults[0].dropped);
  if(delayMs>0 && (faults[0].delayed===0||faults[1].delayed===0))
    throw new Error('Invalid fault case: no unreliable datachannel sends delayed');
  if(!aligned)throw new Error('Same-frame GGRS rollback state divergence at '+frame);
  // An absent favicon is not a gameplay failure; any missing WASM/JS/
  // font/asset is. Generic Chrome 404 console text has no URL, so validate
  // it against the response-level paths rather than suppressing all 404s.
  const optionalMissingMetadata='/assets/fonts/quicksand-light.ttf.meta';
  const isOptional=(f,p)=>f.status===404&&(
    f.path==='/favicon.ico'||
    (f.path===optionalMissingMetadata&&p.fontLoaded));
  const unexpectedFailures=[a,b].flatMap(p=>
    p.httpFailures.filter(f=>!isOptional(f,p)));
  if(!a.fontLoaded||!b.fontLoaded)
    throw new Error('Actual game font did not load HTTP 2xx on both peers');
  if(unexpectedFailures.length||a.errors.length||b.errors.length)
    throw new Error('Required browser resource/runtime errors: '+
      JSON.stringify({unexpectedFailures,
        runtime:[...a.errors,...b.errors].slice(0,4)}));
  console.log(JSON.stringify({
    result:'PASS',
    checkpointFrame:frame,
    stateFingerprintMatch:true,
    syntheticNetwork:{extraSendDelayMs:delayMs,jitterMaxMs:jitterMs,
      repetition,hostBurstDropped:burst,host:{...faults[0]},guest:{...faults[1]}},
    nonzeroInputProvenance:{host:captured[0],guest:captured[1]},
    resourceDiagnostics:{
      fontLoaded:[a.fontLoaded,b.fontLoaded],
      ignoredOptionalFontMeta404:[a,b].flatMap(p=>
        p.httpFailures.filter(f=>isOptional(f,p)&&f.path===optionalMissingMetadata)).length,
      ignoredFavicon404:[...a.httpFailures,...b.httpFailures]
        .filter(f=>f.status===404&&f.path==='/favicon.ico').length,
      otherErrors:unexpectedFailures.length,
      generic404ConsoleMessages:a.generic404Errors+b.generic404Errors
    },
    player0ActuallyMoved:p0Moved,
    player1ActuallyMoved:p1Moved,
    verified:{player0:after[0],player1:after[1]},
    source:'pinned original Bevy/GGRS+Matchbox game with test-only state tracing',
    browser:'two separate headless Chrome processes; one GitHub Actions host',
    caveats:['quantized position and velocity only, not all GGRS state',
      'same x86-64 machine; no iPhone/Android cross-architecture determinism',
      'no synthetic jitter/loss, no true ISP, not actual fighting game']
  },null,2));
}catch(e){
  console.error('GGRS SAME-FRAME INPUT INTEGRATION FAIL: '+e.message);
  for(const player of [a,b])if(player){
    console.error(JSON.stringify({label:player.label,joined:player.joined,
      lastSimFrame:maxFrame(player),sampleCount:player.snapshots.size,
      lastStates:[...player.snapshots.entries()].slice(-3),
      httpFailures:player.httpFailures.slice(0,8),
      fontLoaded:player.fontLoaded,
      generic404Errors:player.generic404Errors,
      impairment:await player.page.evaluate(()=>window.__ggrsImpairment||null)
        .catch(()=>null),
      nonzeroInputs:await player.page.evaluate(()=>window.__p0Inputs||null)
        .catch(()=>null),
      errors:player.errors.slice(0,3)}));
  }
  process.exitCode=1;
}finally{
  await Promise.all([a,b].filter(Boolean).map(p=>p.browser.close().catch(()=>{})));
}
