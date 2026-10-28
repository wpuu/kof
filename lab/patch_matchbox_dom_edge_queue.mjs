/**
 * P0-014G experimental event-level input bridge for 120ms taps.
 * Apply AFTER patch_matchbox_prediction_probe.mjs AND
 * patch_matchbox_stalled_tap_latch.mjs on an isolated pinned upstream copy.
 *
 * Unlike a simple per-frame OR-latch, this can retain a DOM keydown edge
 * even if Bevy's ReadInputs does not run during the physical press.
 * The ordinary native Bevy ButtonInput still contributes to the mask.
 *
 * NOT A PRODUCTION INPUT SYSTEM: masks collapse multiple ordered events,
 * simultaneous directions, releases and combo timings. A real fighter needs
 * a bounded timestamped event queue with deterministic frame assignment.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]||'upstream');
const gamePath=resolve(root,'examples/bevy_ggrs/src/box_game.rs');
let s=readFileSync(gamePath,'utf8');
function once(a,b){
 if(!s.includes(a)||s.indexOf(a)!==s.lastIndexOf(a))
   throw Error('CI-only DOM edge bridge anchor mismatch: '+a.slice(0,80));
 s=s.replace(a,b);
}
once('    fn ci_applied_input(handle: u32, frame: u32, mask: u8);',
`    fn ci_applied_input(handle: u32, frame: u32, mask: u8);

    #[wasm_bindgen(js_namespace = window, js_name = __kofCiTakePendingTap)]
    fn ci_take_pending_tap(handle: u32) -> u8;`);
// Restrict the anchor to read_local_inputs. The applied-input diagnostic
// elsewhere in the file contains a second, deliberately similar if block.
const begin=s.indexOf('pub fn read_local_inputs(');
const finish=s.indexOf('pub fn setup_scene(',begin);
if(begin<0||finish<begin)throw Error('ReadInputs scope missing');
let inputBlock=s.slice(begin,finish);
const anchor='        if input != 0 {\n            #[cfg(target_arch = "wasm32")]';
if(!inputBlock.includes(anchor)||inputBlock.indexOf(anchor)!==inputBlock.lastIndexOf(anchor))
  throw Error('ReadInputs exact nonzero hook anchor missing');
inputBlock=inputBlock.replace(anchor,`        // Consume a browser keydown edge captured earlier, even if GGRS
        // did not invoke ReadInputs during the original 120ms press.
        #[cfg(target_arch = "wasm32")]
        {
            let edge = unsafe { ci_take_pending_tap(*handle as u32) };
            input |= edge;
        }
        if input != 0 {
            #[cfg(target_arch = "wasm32")]`);
s=s.slice(0,begin)+inputBlock+s.slice(finish);
writeFileSync(gamePath,s);
console.log('Added experimental DOM-edge-to-GGRS input bridge to temporary original Bevy game.');
