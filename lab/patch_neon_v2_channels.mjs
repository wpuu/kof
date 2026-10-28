/**
 * P0-011B: experiment-only bridge from the pinned Neon Fist UI/engine to
 * the KOF V2 dual-DataChannel protocol. No ROM, payments or production auth.
 *
 * Copies only the MIT-licensed netcode modules into the isolated upstream
 * public/ folder on the CI runner and replaces the exact V1 Net block.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const upstream = resolve(process.argv[2] || 'upstream');
const targetDir = resolve(upstream, 'public/shared');
mkdirSync(targetDir, { recursive: true });
for (const name of ['v2_datachannels.mjs','v2_protocol.mjs','v2_reliability.mjs']) {
  copyFileSync(resolve(project, 'src/netcode', name),
    resolve(targetDir, name));
}
const index = resolve(upstream, 'public/index.html');
let source = readFileSync(index, 'utf8');

const importMarker = "import { Telemetry, FUNNEL } from './shared/telemetry.js';";
if (!source.includes(importMarker) || source.indexOf(importMarker) !== source.lastIndexOf(importMarker))
  throw Error('upstream import marker missing or duplicated');
source = source.replace(importMarker, importMarker +
  "\nimport { createV2ChannelSession } from './shared/v2_datachannels.mjs';");

const start = "const Net = (()=>{";
const end = "/* ============================ RENDERING ============================ */";
const a = source.indexOf(start), b = source.indexOf(end);
if (a<0 || b<=a || source.indexOf(start,a+start.length)>=0)
  throw Error('pinned Neon Fist Net block not uniquely found');

const implementation = `const Net = (()=>{
  let pc=null, session=null, role=null, matchId=0;
  let active=false, remoteFrame=-1;
  const stat=document.getElementById('netstat');
  const outEl=document.getElementById('netout');
  const inEl=document.getElementById('netin');
  function say(m){stat.textContent=m;}
  function makePC(){
    // Match the original ICE test anchor; CI substitutes host-only config.
    const p=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
    p.oniceconnectionstatechange=()=>say('ICE: '+p.iceConnectionState);
    return p;
  }
  function closeUI(){document.getElementById('netui').style.display='none';}
  function showVoid(info){
    active=false;
    Game.paused=true;
    Net.voided=true;
    Net.voidReason=info.reason;
    Net.voidDetail=String(info.detail||'').slice(0,180);
    document.getElementById('netui').style.display='flex';
    say('MATCH UNVERIFIED / VOID: '+String(info.reason)+' — no trusted score');
  }
  function onRemoteInput(frame,mask){
    const remote=role==='host'?1:0;
    if(frame>remoteFrame)remoteFrame=frame;
    const changed=Sim.setInput(frame,remote,mask);
    if(changed && frame<Game.frame && frame>=Game.frame-ROLLBACK_MAX){
      Net.rollbackTo=Math.min(Net.rollbackTo===undefined?Infinity:Net.rollbackTo,frame);
    }
  }
  function initSession(){
    const fp=parseInt(String(CONFIG_FINGERPRINT||'0'),16)>>>0;
    session=createV2ChannelSession({
      pc,role:role==='host'?0:1,matchId,configFingerprint:fp,
      currentFrame:()=>active?Game.frame:0,
      onInput:onRemoteInput,
      onReady:()=>{
        Net.voided=false;Net.voidReason=null;Net.voidDetail=null;Net.rollbackTo=undefined;
        active=true;remoteFrame=-1;
        Game.paused=false;Game.cpu=false;
        Sim.init();
        startMatch();
        // The first real game input targets frame 2; both peers must have
        // explicit neutral initial inputs for frames 0 and 1 to advance ACK.
        session.sendInput(0,0);session.sendInput(1,0);
        closeUI();
      },
      onAbort:showVoid,
      rollbackWindow:ROLLBACK_MAX,requestCooldownMs:35
    });
  }
  async function gathered(){
    if(pc.iceGatheringState==='complete')return;
    await new Promise(resolve=>{
      const deadline=setTimeout(resolve,7000);
      const on=()=>{
        if(pc.iceGatheringState!=='complete')return;
        pc.removeEventListener('icegatheringstatechange',on);
        clearTimeout(deadline);resolve();
      };
      pc.addEventListener('icegatheringstatechange',on);
    });
  }
  function parseCode(text,expectedType){
    const code=JSON.parse(atob(text.trim()));
    if(code.v!==2 || !code.desc ||
       code.desc.type!==expectedType || !code.desc.sdp ||
       !Number.isInteger(code.matchId) || code.matchId<1)
      throw Error('V2 incompatible or invalid matchmaking code');
    return code;
  }
  return {
    rollbackTo:undefined,remoteChk:new Uint32Array(64),
    desync:false,voided:false,voidReason:null,voidDetail:null,
    get active(){return active && !!session?.ready && !Net.voided;},
    get role(){return role;},
    get localPlayer(){return role==='host'?0:1;},
    get remoteFrame(){return remoteFrame;},
    get v2Metrics(){return session?{...session.metrics,...session.peer.metrics}:null;},
    send(frame,mask,_legacyChecksum){
      if(!session?.ready || Net.voided)return;
      if(!session.tick(Game.frame,performance.now()))return;
      if(!session.sendInput(frame,mask))showVoid({reason:'send_failed'});
    },
    async host(){
      try{
        role='host';Game.paused=true;
        pc=makePC();
        matchId=crypto.getRandomValues(new Uint32Array(1))[0]||1;
        initSession(); // create both channels before the SDP offer
        const offer=await pc.createOffer();
        await pc.setLocalDescription(offer);await gathered();
        outEl.value=btoa(JSON.stringify({v:2,matchId,desc:pc.localDescription}));
        say('V2 offer ready — share code with opponent');
      }catch(e){showVoid({reason:'offer_failed'});}
    },
    async join(){
      role='guest';Game.paused=true;pc=makePC();
      say('V2: paste host offer then ACCEPT');
    },
    async accept(){
      try{
        const code=parseCode(inEl.value,role==='guest'?'offer':'answer');
        if(role==='guest'){
          matchId=code.matchId;
          initSession(); // install ondatachannel before remote offer arrives
          await pc.setRemoteDescription(code.desc);
          const answer=await pc.createAnswer();
          await pc.setLocalDescription(answer);await gathered();
          outEl.value=btoa(JSON.stringify({v:2,matchId,desc:pc.localDescription}));
          say('V2 answer ready — share code with host');
        }else{
          if(code.matchId!==matchId)throw Error('wrong match');
          await pc.setRemoteDescription(code.desc);
          say('V2 answer accepted — connecting dual channels');
        }
      }catch(e){showVoid({reason:'V2_SDP_REJECTED'});}
    },
    loopbackTest(){say('V2 requires two real browser peers. Use two tabs.');},
    close(){
      active=false;session?.close();pc?.close();session=null;
      Game.paused=true;
    }
  };
})();

`;
source = source.slice(0,a)+implementation+source.slice(b);
writeFileSync(index,source);
console.log('Applied experimental V2 transport bridge to pinned Neon Fist UI/engine');
