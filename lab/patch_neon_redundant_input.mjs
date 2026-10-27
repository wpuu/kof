/**
 * Experimental packet-loss recovery patch for pinned Neon Fist version:
 * c28ffb7e7e81ed8f9cec274772c43c30d2876d42
 *
 * Fixed 29-byte gameplay input packet:
 *   0..8   current frame(int32), mask(u8), checksum(u32)
 *   9..28  four previous (frame:int32, mask:u8) input pairs
 *
 * DataChannel remains unordered with zero retransmissions, but neighboring
 * packets carry copies of the last four frame inputs. Experimental only.
 * DO NOT use in commercial play without desync/DoS/version compatibility tests.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const path = resolve(process.argv[2] || 'upstream', 'public/index.html');
const src = readFileSync(path, 'utf8');
const begin = "  /* packet: [frame(int32), mask(uint8), checksum(uint32)] */";
const end = "  function closeUI(){ document.getElementById('netui').style.display='none'; }";
const a = src.indexOf(begin), b = src.indexOf(end);
if (a < 0 || b <= a || src.indexOf(begin, a + begin.length) >= 0 ||
    src.indexOf(end, b + end.length) >= 0)
  throw Error('Pinned game input codec anchors missing, reordered or duplicated');

const codec = `  /* P0 isolated experiment: 9-byte current input + four previous frames.
     These 20 extra payload bytes cost ~1.2KB/s per player at 60 FPS, before
     protocol overhead. This does not provide unlimited loss recovery. */
  const RECENT_INPUTS=4, PACKET_BYTES=9+RECENT_INPUTS*5;
  const txBuf=new ArrayBuffer(PACKET_BYTES);
  const txView=new DataView(txBuf);
  const txHistory=[];
  let lastWireFrame=-1;
  function send(frame,mask,chk){
    if(!ready) return;
    if(frame<=lastWireFrame) txHistory.length=0; // rematch/clock reset
    lastWireFrame=frame;
    txView.setInt32(0,frame,true);
    txView.setUint8(4,mask);
    txView.setUint32(5,chk,true);
    for(let i=0;i<RECENT_INPUTS;i++){
      const past=txHistory[txHistory.length-1-i];
      txView.setInt32(9+i*5,past?past.frame:-1,true);
      txView.setUint8(13+i*5,past?past.mask:0);
    }
    txHistory.push({frame,mask});
    if(txHistory.length>RECENT_INPUTS)txHistory.shift();
    try{ dc.send(txBuf); }catch(e){}
  }
  function onPacket(data){
    if(!(data instanceof ArrayBuffer)||data.byteLength!==PACKET_BYTES) return;
    const dv=new DataView(data);
    const frame=dv.getInt32(0,true),
          mask=dv.getUint8(4),
          chk=dv.getUint32(5,true);
    // Avoid huge frame indices and unbounded sparse arrays sent by peers.
    if(frame<0 || frame<Game.frame-64 || frame>Game.frame+64) return;
    const remotePlayer=role==='host'?1:0;
    if(frame>remoteFrame) remoteFrame=frame;
    let earliest=Infinity;
    const apply=(f,m,history)=>{
      if(f<0 || f>frame || f>Game.frame+64) return;
      if(f<Game.frame-ROLLBACK_MAX) {
        Net.unrecoverablyLate++;
        return;
      }
      const changed=Sim.setInput(f,remotePlayer,m);
      if(changed && history)Net.historyCorrections++;
      if(changed && f<Game.frame)earliest=Math.min(earliest,f);
    };
    // Apply older inputs before current input so the earliest changed frame
    // controls rollback. Duplicate data is idempotent at the frame level.
    for(let i=RECENT_INPUTS-1;i>=0;i--){
      const f=dv.getInt32(9+i*5,true), m=dv.getUint8(13+i*5);
      if(f>=0)apply(f,m,true);
    }
    apply(frame,mask,false);
    if(earliest!==Infinity) {
      Net.rollbackTo=Math.min(Net.rollbackTo===undefined?Infinity:Net.rollbackTo,earliest);
    }
    Net.remoteChk[frame&63]=chk;
  }

`;
const newSrc = src.slice(0, a) + codec + src.slice(b);
if (newSrc === src) throw Error('No change');
const marker = "    rollbackTo:undefined, remoteChk:new Uint32Array(64), desync:false,";
if (!newSrc.includes(marker)) throw Error('Metrics marker missing');
const updated = newSrc.replace(marker,
  "    rollbackTo:undefined, remoteChk:new Uint32Array(64), desync:false,\n" +
  "    historyCorrections:0, unrecoverablyLate:0,");
writeFileSync(path, updated);
console.log('Applied fixed-size redundant-input experimental patch: 9→29 bytes per frame; no output of peer SDP/IP.');
