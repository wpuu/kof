/**
 * P0-013D, TEST-ONLY hook for the pinned Matchbox/Bevy/GGRS WASM demo.
 * It composes with patch_matchbox_state_probe.mjs and is applied solely to
 * the GitHub Actions temporary source clone, not the upstream repository.
 *
 * A wasm-bindgen import calls a browser function synchronously when Bevy
 * captures a nonzero LOCAL input, before GGRS queues the game frame.
 * A separate browser hook records when a nonzero input for either handle is
 * actually APPLIED in the rollback simulation (including re-simulation).
 *
 * Important: WebRTC DATA packets may carry more than one GGRS frame.
 * This hook proves the lost burst follows nonzero local input capture, but
 * it does not yet decode each dropped packet's included game frame inputs.
 */
import './patch_matchbox_state_probe.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const upstream=resolve(process.argv[2] || 'matchbox-upstream');
const file=resolve(upstream,'examples/bevy_ggrs/src/box_game.rs');
function once(value,from,to,where){
  if(!value.includes(from)||value.indexOf(from)!==value.lastIndexOf(from))
    throw new Error('Unexpected pinned upstream anchor in '+where+': '+from.slice(0,60));
  return value.replace(from,to);
}
let source=readFileSync(file,'utf8');
source=once(source,
  'use serde::{Deserialize, Serialize};',
  `use serde::{Deserialize, Serialize};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::wasm_bindgen;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
unsafe extern "C" {
    #[wasm_bindgen(js_namespace = window, js_name = __kofCiLocalInput)]
    fn ci_local_input(handle: u32, frame: u32, mask: u8);

    #[wasm_bindgen(js_namespace = window, js_name = __kofCiAppliedInput)]
    fn ci_applied_input(handle: u32, frame: u32, mask: u8);
}`,file);
source=once(source,
  '    local_players: Res<LocalPlayers>,\n) {',
  '    local_players: Res<LocalPlayers>,\n    frame_count: Res<FrameCount>,\n) {',file);
source=once(source,
  '        local_inputs.insert(*handle, BoxInput { inp: input });',
  `        if input != 0 {
            #[cfg(target_arch = "wasm32")]
            unsafe { ci_local_input(*handle as u32, frame_count.frame, input); }
        }
        local_inputs.insert(*handle, BoxInput { inp: input });`,file);
source=once(source,
  '    time: Res<Time>,\n) {',
  '    time: Res<Time>,\n    frame_count: Res<FrameCount>,\n) {',file);
source=once(source,
  '        let input = inputs[p.handle].0.inp;',
  `        let input = inputs[p.handle].0.inp;
        if input != 0 {
            #[cfg(target_arch = "wasm32")]
            unsafe { ci_applied_input(p.handle as u32, frame_count.frame, input); }
        }`,file);
writeFileSync(file,source);
console.log('Installed test-only synchronous local-nonzero-input and rollback-applied-input wasm-bindgen hooks.');
