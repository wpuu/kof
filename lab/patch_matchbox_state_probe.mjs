/**
 * P0-013 isolated instrumentation for the pinned Matchbox Bevy/GGRS game.
 * The original upstream clone is modified only inside CI, never published.
 * Only logs compact core rollback component values in 60Hz simulations.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || 'matchbox-upstream');
const mainPath = resolve(root, 'examples/bevy_ggrs/src/main.rs');
const gamePath = resolve(root, 'examples/bevy_ggrs/src/box_game.rs');
function replaceExactlyOnce(source, from, to, path) {
  const i=source.indexOf(from);
  if(i<0 || source.indexOf(from,i+from.length)>=0)
    throw new Error('Pinned upstream source anchor mismatch: '+path);
  return source.slice(0,i)+to+source.slice(i+from.length);
}
const main=readFileSync(mainPath,'utf8');
const ordered=replaceExactlyOnce(main,
  '.add_systems(GgrsSchedule, (move_cube_system, increase_frame_system))',
  '.add_systems(GgrsSchedule, (move_cube_system, increase_frame_system).chain())',
  mainPath);
const game=readFileSync(gamePath,'utf8');
const original = `pub fn increase_frame_system(mut frame_count: ResMut<FrameCount>) {
    frame_count.frame += 1;
}`;
const instrumented = `pub fn increase_frame_system(
    mut frame_count: ResMut<FrameCount>,
    state: Query<(&Transform, &Velocity, &Player), With<Rollback>>,
) {
    frame_count.frame += 1;
    // Emit only every 30th deterministic simulation frame to avoid log overhead.
    // Data is sorted by the stable peer player handle, not Bevy entity order.
    if frame_count.frame % 30 == 0 {
        let quantize = |value: f32| -> i64 { (value * 10000.0).round() as i64 };
        let mut players: Vec<(usize, i64, i64, i64, i64)> = state
            .iter()
            .map(|(t, v, p)| (
                p.handle,
                quantize(t.translation.x),
                quantize(t.translation.z),
                quantize(v.x),
                quantize(v.z),
            ))
            .collect();
        players.sort_by_key(|item| item.0);
        info!("KOF_CI_STATE frame={} state={:?}", frame_count.frame, players);
    }
}`;
const edited=replaceExactlyOnce(game,original,instrumented,gamePath);
writeFileSync(mainPath,ordered);
writeFileSync(gamePath,edited);
console.log('Instrumented pinned GGRS demo test-only: chained movement/frame update and sorted frame-state logs.');
