/**
 * Real browser/WebRTC integration test for pinned Matchbox official simple_example.
 * The original Rust code joins ws://localhost:3536/ and sends "hello friend!"
 * on peer join. No fake signaling, no game ROM or trusted account data.
 */
import { chromium } from 'playwright';
const url=process.env.MATCHBOX_SIMPLE_URL||'http://127.0.0.1:1335/';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(label,condition,timeoutMs=45000) {
  const start=Date.now();
  while(Date.now()-start<timeoutMs) {
    if(await condition()) return;
    await sleep(150);
  }
  throw new Error('Timeout: '+label);
}
async function runClient(name) {
  const browser=await chromium.launch({
    executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  const context=await browser.newContext();
  const page=await context.newPage();
  const events={connecting:0,joined:0,messages:0,wsCreated:0,wsClosed:0,wsErrors:0};
  const errors=[];
  page.on('console',msg=>{
    const text=msg.text();
    if(/Connecting to matchbox/.test(text))events.connecting++;
    if(/Peer joined:/.test(text))events.joined++;
    if(/Message from .*hello friend!/.test(text))events.messages++;
    if(msg.type()==='error'){
      // All signaling is localhost in this isolated CI. Preserve code/error
      // text, not raw SDP, candidates, credentials or opaque peer IDs.
      const safe=t=>t.replace(/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/gi,'[peer]')
        .replace(/candidate:[^\\s]+/gi,'candidate:[redacted]');
      errors.push('console:'+safe(text).slice(0,250));
    }
  });
  page.on('websocket',ws=>{
    events.wsCreated++;
    ws.on('close',()=>events.wsClosed++);
    ws.on('socketerror',()=>events.wsErrors++);
  });
  page.on('requestfailed',req=>{
    const address=new URL(req.url());
    if(/\\.wasm$|\\.js$/.test(address.pathname))
      errors.push('failed resource '+address.pathname);
  });
  page.on('pageerror',err=>errors.push(err.name+':'+err.message.slice(0,100)));
  await page.goto(url,{waitUntil:'load',timeout:20000});
  return {name,browser,page,events,errors};
}
const clients=[];
try{
  const [a,b]=await Promise.all([runClient('playerA'),runClient('playerB')]);
  clients.push(a,b);
  await waitFor('both browser WASM modules initialize',
    async()=>{const statuses=await Promise.all(clients.map(c=>
      c.page.evaluate(()=>window.__kofMatchboxSimpleState)));
      if(statuses.some(s=>String(s).startsWith('error:')))throw Error('WASM init error');
      return statuses.every(s=>s==='initialized');
    },30000);
  await waitFor('both players join and exchange WebRTC payloads',
    ()=>clients.every(c=>c.events.joined>0&&c.events.messages>0),
    35000);
  if(clients.some(c=>c.errors.length))throw Error('Unexpected browser console/runtime error');
  console.log(JSON.stringify({
    result:'PASS',
    scope:'two separate actual Chrome processes, official Rust/WASM Matchbox socket + self-hosted signaling',
    players:clients.map(c=>({name:c.name,events:c.events})),
    proof:'both received a peer join notification and hello friend! payload',
    notVerified:['GGRS rollback rendering','actual fighter game','WAN NAT/TURN','Android/iOS','production security']
  },null,2));
}catch(e){
  console.error('MATCHBOX OFFICIAL SIMPLE WEBRTC FAIL: '+e.message);
  for(const c of clients)
    console.error(JSON.stringify({name:c.name,state:await c.page.evaluate(()=>
      window.__kofMatchboxSimpleState).catch(()=>null),events:c.events,errors:c.errors}));
  process.exitCode=1;
}finally{
  await Promise.all(clients.map(c=>c.browser.close().catch(()=>{})));
}