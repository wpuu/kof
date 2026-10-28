/**
 * P0-014 controlled source patch, PINNED Matchbox Bevy/GGRS example only.
 * Change max prediction window as the sole gameplay simulation parameter.
 * Does not modify base input delay, state model, or rollback algorithm.
 * This is an experiment, not a recommended production setting.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const upstream=resolve(process.argv[2]||'upstream');
const prediction=Number(process.argv[3]);
if(![16,20].includes(prediction))throw Error('Only bounded 16/20 frame candidates supported');
const path=resolve(upstream,'examples/bevy_ggrs/src/main.rs');
let source=readFileSync(path,'utf8');
const anchor='    let max_prediction = 12;';
if(source.split(anchor).length!==2)throw Error('Pinned prediction-window anchor not unique');
source=source.replace(anchor,'    let max_prediction = '+prediction+';');
writeFileSync(path,source);
console.log('P0-014 prediction-window-only candidate '+prediction+' frames; source not deployed');
