/**
 * P0-014D experimental mitigation ONLY in a temporary pinned Bevy/GGRS
 * demo: preserve a short, nonzero local key press while GGRS is stalled on
 * one simulation frame and repeatedly calls ReadInputs/add_local_input.
 *
 * This is NOT a production fighting-game input-event queue. OR-ing masks
 * can collapse ordering and opposing directional inputs; never use this
 * prototype as final special-move/combo buffering without dedicated tests.
 *
 * Requires patch_matchbox_prediction_probe.mjs to have been applied first,
 * so the physical (pre-latch) input hook remains separate from simulation.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]||'upstream');
const mainPath=resolve(root,'examples/bevy_ggrs/src/main.rs');
const gamePath=resolve(root,'examples/bevy_ggrs/src/box_game.rs');
function once(s,a,b,name){
 if(!s.includes(a)||s.indexOf(a)!==s.lastIndexOf(a))
   throw Error('Pinned GGRS demo anchor mismatch '+name+': '+a.slice(0,75));
 return s.replace(a,b);
}
let main=readFileSync(mainPath,'utf8');
main=once(main,'.init_resource::<FrameCount>()',
'.init_resource::<FrameCount>()\n        .init_resource::<CiTapLatch>()',mainPath);
writeFileSync(mainPath,main);

let game=readFileSync(gamePath,'utf8');
const anchor='pub fn read_local_inputs(';
game=once(game,anchor,`/// Keeps a single nonzero direction/button mask from being overwritten
/// when the same simulation frame is polled repeatedly during netplay stalls.
/// Scoped to the original demo's simple per-frame input, not a general
/// fighting-game edge queue with ordering, taps, releases and combos.
#[derive(Resource, Default)]
pub struct CiTapLatch {
    last_sim_frame: Option<u32>,
    pending: HashMap<usize, u8>,
}
pub fn read_local_inputs(`,gamePath);
game=once(game,
  '    local_players: Res<LocalPlayers>,\n    frame_count: Res<FrameCount>,\n) {',
  '    local_players: Res<LocalPlayers>,\n    frame_count: Res<FrameCount>,\n    mut tap_latch: ResMut<CiTapLatch>,\n) {',
  gamePath);
game=once(game,
  '    let mut local_inputs = HashMap::new();',
  `    let mut local_inputs = HashMap::new();
    // The local latch is deliberately NOT rolled back. It persists across
    // repeated ReadInputs calls of one live frame and clears only after the
    // live simulation frame changes. It is never authoritative game state.
    if tap_latch.last_sim_frame != Some(frame_count.frame) {
        tap_latch.last_sim_frame = Some(frame_count.frame);
        tap_latch.pending.clear();
    }`,
  gamePath);
game=once(game,
  '        local_inputs.insert(*handle, BoxInput { inp: input });',
  `        // Keep the first key press through a PredictionThreshold stall,
        // even if the physical key is released before frame consumption.
        let preserved = tap_latch.pending.entry(*handle).or_insert(0);
        *preserved |= input;
        local_inputs.insert(*handle, BoxInput { inp: *preserved });`,
  gamePath);
writeFileSync(gamePath,game);
console.log('P0-014D experimental single-frame short-tap latch added to temporary Bevy/GGRS demo.');
