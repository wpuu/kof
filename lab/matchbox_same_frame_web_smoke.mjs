/**
 * P0-013: actually compare same simulation-frame rollback component state
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
    // Record only status/path. No user query, identity, ICE or SDP.
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
  // Different physical players produce different input streams.
  await a.page.bringToFront();
  await a.page.keyboard.down('w');
  await sleep(420);
  await a.page.keyboard.up('w');
  await b.page.bringToFront();
  await b.page.keyboard.down('d');
  await sleep(420);
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
  if(!aligned)throw new Error('Same-frame P0-013 rollback component snapshot mismatch at '+frame);
  // An absent favicon is not a gameplay failure; any missing WASM/JS/
  // font/asset is. Generic Chrome 404 console text has no URL, so validate
  // it against the response-level paths rather than suppressing all 404s.
  const optionalMissingMetadata='/assets/fonts/quicksand-light.ttf.meta';
  const isOptional=(f,p)=>f.status===404&&(
    f.path==='/favicon.ico' ||
    (f.path===optionalMissingMetadata&&p.fontLoaded));
  const unexpectedFailures=[a,b].flatMap(p=>
    p.httpFailures.filter(f=>!isOptional(f,p)));
  if(!a.fontLoaded||!b.fontLoaded)
    throw new Error('Game font itself did not return HTTP 2xx on both peers');
  if(unexpectedFailures.length||a.errors.length||b.errors.length)
    throw new Error('Required browser resource/runtime errors: '+
      JSON.stringify({unexpectedFailures,
        runtime:[...a.errors,...b.errors].slice(0,4)}));
  console.log(JSON.stringify({
    result:'PASS',
    checkpointFrame:frame,
    stateFingerprintMatch:true,
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
      errors:player.errors.slice(0,3)}));
  }
  process.exitCode=1;
}finally{
  await Promise.all([a,b].filter(Boolean).map(p=>p.browser.close().catch(()=>{})));
}
