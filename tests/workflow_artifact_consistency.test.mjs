import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** CI-only guard against copying a workflow and forgetting the download name.
 * For any build/test workflow containing its own upload-artifact and
 * download-artifact steps, all download names must match an uploaded name.
 * Workflows intentionally downloading from a DIFFERENT run are excluded.
 */
const paths=[
  '.github/workflows/p0-014a-prediction-ab.yml',
  '.github/workflows/p0-014d-stalled-tap-latch.yml',
  '.github/workflows/p0-013d-nonzero-10x.yml'
];
function artifactSteps(content,kind){
  const lines=content.split(/\r?\n/),res=[];
  for(let i=0;i<lines.length;i++){
    if(!lines[i].includes('uses: actions/'+kind+'-artifact@v4'))continue;
    let name=null;
    for(let k=i+1;k<Math.min(i+13,lines.length);k++){
      if(/^\s+- (name:|uses:)/.test(lines[k]))break;
      const m=lines[k].match(/^\s+name:\s*([^#\s]+)/);
      if(m){name=m[1];break;}
    }
    assert.ok(name,'Missing artifact name for '+kind+' step at line '+(i+1));
    res.push(name);
  }
  return res;
}
for(const path of paths){
 test('upload/download artifact names match: '+path,()=>{
   const s=readFileSync(path,'utf8');
   const uploads=artifactSteps(s,'upload');
   const downloads=artifactSteps(s,'download');
   assert.ok(uploads.length>0,'Expected at least one upload');
   assert.ok(downloads.length>0,'Expected at least one download');
   const produced=new Set(uploads);
   for(const artifact of downloads)
     assert.ok(produced.has(artifact),
       'Workflow downloads '+artifact+' but uploads only '+uploads.join(', '));
 });
}
