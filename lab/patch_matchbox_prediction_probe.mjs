/**
 * P0-014A: compose previous pinned nonzero-input and state probes,
 * expose per-room max_prediction via WASM URL query, and log stalls/events.
 *
 * A single Bevy/GGRS binary can then test prediction_window=12/16/20 on
 * separate Chrome/Matchbox sessions without expensive Rust rebuilds.
 * CI-only patch of a temporary, immutable upstream clone. No ROM/assets.
 */
import './patch_matchbox_nonzero_input_probe.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]||'upstream');
const argsPath=resolve(root,'examples/bevy_ggrs/src/args.rs');
const mainPath=resolve(root,'examples/bevy_ggrs/src/main.rs');
function once(s,a,b,name){
 if(!s.includes(a)||s.indexOf(a)!==s.lastIndexOf(a))
   throw Error('Unexpected pinned '+name+' source anchor '+a.slice(0,75));
 return s.replace(a,b);
}
let args=readFileSync(argsPath,'utf8');
args=once(args, `    #[clap(long, short, default_value = "2")]
    pub players: usize,`,
 `    #[clap(long, short, default_value = "2")]
    pub players: usize,

    // CI-only argument: configure GGRS's prediction limit per browser.
    #[clap(long, default_value = "12")]
    pub prediction_window: usize,`,argsPath);
writeFileSync(argsPath,args);
let main=readFileSync(mainPath,'utf8');
main=once(main,'    let max_prediction = 12;',`    let max_prediction = args.prediction_window;
    assert!((8..=20).contains(&max_prediction), "CI prediction window must be 8..20");
    info!("KOF_CI_CONFIG max_prediction={} input_delay=2", max_prediction);`,mainPath);
const existing=`fn log_ggrs_events(mut session: ResMut<Session<BoxConfig>>) {
    match session.as_mut() {
        Session::P2P(s) => {
            for event in s.events() {
                info!("GGRS Event: {event:?}");
            }
        }
        _ => panic!("This example focuses on p2p."),
    }
}`;
const instrumented=`fn log_ggrs_events(
    mut session: ResMut<Session<BoxConfig>>,
    frame_count: Res<FrameCount>,
    mut last: Local<(u32, usize)>,
) {
    match session.as_mut() {
        Session::P2P(s) => {
            let session_frame = s.current_frame();
            let ahead = s.frames_ahead();
            let max_prediction = s.max_prediction();
            if last.0 == frame_count.frame {
                last.1 += 1;
                if matches!(last.1, 6 | 12 | 24 | 48) {
                    info!(
                        "KOF_CI_STALL sim_frame={} session_frame={} same_frame_polls={} frames_ahead={} prediction={}",
                        frame_count.frame, session_frame, last.1, ahead, max_prediction
                    );
                }
            } else {
                last.0 = frame_count.frame;
                last.1 = 0;
            }
            for event in s.events() {
                info!(
                    "KOF_CI_GGRS_EVENT sim_frame={} session_frame={} frames_ahead={} event={event:?}",
                    frame_count.frame, session_frame, ahead
                );
            }
        }
        _ => panic!("This example focuses on p2p."),
    }
}`;
main=once(main,existing,instrumented,mainPath);
writeFileSync(mainPath,main);
console.log('P0-014A: CI-only prediction_window query + GGRS current_frame/frames_ahead/wait events and stall probes.');
