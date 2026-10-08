# Dusk Dusk Goose — final acceptance record

This records what was checked, including checks that could not establish the requested quality bar. Local automated sessions are desktop Chromium with Windows D3D11 at 667×375 and 1366×768; they are not physical phones or first-time human players. Final browser runs explicitly select the RTX 4050 using process launch flags. Earlier Intel Arc results remain in the evidence. Nothing has been deployed.

## Built by phase

| Phase | Result |
|---|---|
| 0 Prepare | Replaced project instructions with owner-authorized direction, preserved old end tag, created living plan. |
| 1 Chase | Server-authoritative beam/freeze/lunge/catch/battery/pickup rules, validated human movement, computer players, shared Park collision and balance harness. |
| 2 Solo | Immediate solo start, daily escalating flock, first-freeze attention, saved best/rewards, repeated fast catch/retry. |
| 3 Multiplayer | Room codes/private seats, joining without an empty wait, infection/rotation/filler bots,75s rounds, finale/scoring/results/rematch, stale-seat cover and bounded lag fairness. |
| 4 Look | Supplied animated kit kids/October Park props, code-built expressive goose, shader-lit warm beams and bright blue night, raised camera, living title and persistent HUD. |
| 5 Feel/sound | Ice/thaw/shield, wind-up/miss/near, hit-stop/feathers/pop/camera response, pickups/lamps/last kid/finale/dawn,27 selected MP3 files plus synthesized goose cues, gesture unlock/mute/hidden handling. |
| 6 Hardening | Cul-de-sac4–6, adaptive resolution/tiers and bounded disposal, every-state recovery, portrait/fullscreen/home-screen affordances, clean production check, deployment guide and intact historical archive. |
| 7 Final | Five consecutive server cycles passed; final current browser suite 17/17 passed, screenshots reviewed, every section7 item recorded, clean production start verified. Quality limits and historical failures disclosed below. |

## Known weaknesses, ranked by player impact

1. **Computer-player balance.** Four-seat all-bot rounds produce no catches; six-seat rounds snowball in10.75s. Other counts strongly favour kids, and median solo is14.55s. The explicit balance exception is documented below; human fun/balance has not been established.
2. **Performance on integrated GPUs and phones.** Dynamic resolution can fall to roughly 60% of display resolution. Earlier Intel Arc samples stalled; a dedicated-GPU diagnostic averaged about 60 FPS at both sizes. Steady physical mid-range-phone FPS and battery/thermal endurance are unknown.
3. **Scenery/lighting depth.** The Park remains flatter than the reference, and Cul-de-sac buildings/road are visibly simple shapes. Blue ambient dominates some views; the intended bright readable night is achieved more strongly than the reference's rich warm depth.
4. **Crowded close-ups.** Catcher/new goose can overlap during conversion. Foreground trees/buildings can obscure feet; house cutaway and catcher recoil reduce this without changing collisions.
5. **Delayed corrections.** Latest 100/200ms-each-way tests record 0/0 and 0/17 corrections across the two clients. Freeze/infection/chase flows pass. No physical cellular-network fairness study was performed.

For listening, SOUND_CHOICES.md lists all27 MP3 mappings and synthesized honk/hiss/flap/poof/heartbeat/low-battery/dawn substitutes. Audio totals1,800,004bytes before licences; supplied filenames/licences are preserved. Start with lobby/chase/finale music, the kazoo honk, freeze/thaw and catch, then listen for MP3 loop seams. Automated signal checks are not an audition.

## Research00 section7, every line reviewed

| Requirement | Finding and evidence |
|---|---|
| Tell kid from goose within one second on a phone | Visual review: oversized humanoid kid versus low, wide bird with bill/cap/glowing eyes. Art probe measures phone kid>56px. No timed stranger study; overlapping conversions can obscure the new bird. |
| Less than10% near-black during play | Phase7 pixel analysis covers 33 screenshots, maximum.00858% (Rec709 luma<16/255), evidence/phase7/pixels.json. This measures brightness, not attractive lighting. |
| Move, light, freeze and flee within 10s of Play | Actual keyboard movement/light, authoritative freeze, movement afterward and repeated catch/retry. Final full run: chase 3.084/3.095s, freeze 4.804/4.775s, retries 1.789–1.839s at phone/laptop sizes. This is scripted input, not a first-time-learning study. |
| Catch/freeze/near/pickup/conversion visible, audible and satisfying | FEEDBACK_VERIFICATION.md maps every cue. Art probe measures actual animation/ice/hold/pop/particles; rare authoritative fixture isolates near/miss/pickup/last-kid/finale/dawn. Web Audio checks decode/output/mute/return. Perceived satisfaction, mix and loop seams require listening/play. |
| A converted player immediately chases a friend | Three independent sessions use real input: catch→converted goose→second human catch in<3s, matching event on every client. Full two-session rounds separately cover infection, refresh, dawn/shared scores and rotated rematch. |
| Laptop 60 FPS; steady mid-range-phone quality | Final-source RTX 4050/D3D11 run: 59.85 FPS at 667×375 and 59.80 FPS at 1366×768, full resolution, p99 16.8 ms; worst 50.0/33.4 ms, browser errors/corrections 0. A separate nonblocking GPU-query diagnostic averaged 16.666/16.680 ms frames and 1.17/3.68 ms GPU work. Earlier Intel Arc runs varied substantially, including 42.87/44.44 FPS and multi-second stalls; those reports are retained. Dedicated-GPU launch selection is a test environment choice, not an integrated-GPU fix. **Perfectly steady 60 FPS and physical mid-range-phone performance are not established.** Adaptive tiers and resources are tested. The suggested eight-program budget is exceeded; High shadowed spotlight/GPU-database detection were omitted, and Low retains the AA context. |
| No scroll/cut-off,16px text/44px targets at667×375 | Actual phone/laptop captures and control/card bounds checked, fixed page/canvas/portrait viewport, persistent controls. Screen corners reachable in emulation; physical thumb comfort/safe-area/browser chrome unverified. Foreground scenery can obscure feet and nearby character bodies overlap. |

## Required evidence and checks

Historical compatibility tests retain their original assertions and run against the correct archived applications; their results do not prove the new game's quality. Full output remains in ignored local logs; compact counts/failures, metrics and selected PNGs are committed.

| Command (working directory) | Result |
|---|---|
| `node scripts/final-server-check.mjs` (`game`) | Five consecutive83game+12archive passes;475total,0skips/failures. |
| `npx playwright test --reporter=json` (`game`, Phase7 evidence variables) | Final complete run **17/17 passed in 469.12s**, 0 skips/failures/flaky retries. Independent sessions cover full rounds, conversion, refresh, silent drop, recovery and rematch. Earlier failures preserved; sixth interrupted. |
| `node scripts/legacy-browser-check.mjs` (`game`) | Original hide-and-seek28/30; unchanged focused readiness and trail reruns1/1each. |
| `npx playwright test --reporter=json` (`legacy/story`) | Original story22/24,0skip/flaky; focused retry1/2: invite passed, retired world pickup still fails. |
| `npx tsx scripts/balance.ts 500` (`game`) |2,500multiplayer+500solo simulations completed; most targets miss. |
| `node scripts/gpu-profile.mjs` (`game`) | Hardware query diagnostic completed, errors0; unstable frame tails at both sizes. |
| Clean-copy `npm ci --include=dev`, build, prune, production-check | All passed locally; audit0, compiled HTTP/WebSocket/restart/404 checks pass. |

`node scripts/final-server-check.mjs`: after the60Hz quality-recovery repair, five consecutive cycles each83/83game and12/12archived-story tests,475passes total,0fail/skip. `evidence/phase7/server-five-passes.json` stores counts and timings; the earlier470-pass report is preserved separately. Server code/tests remain unchanged since those passes. After the later client score repair, the revised source passed a fresh install/build/prune/compiled-start check in `.production-final-20261007-2224`, recorded in `evidence/phase7/production-check.json` and DEPLOY.md. Main and clean-copy builds both produced721.66KB/gzip191.09KB JS; the bundle-size advisory remains.

The final500-seed simulation is in `evidence/phase6/balance-final-500.json`. It misses most balance targets: kid wins85.2/85.2/100/95.2/0% at2–6 seats; first catch55.4/55.4/none/61.35/10.25s; zero-catch52/52/100/5/0%; solo14.55s. PLAN.md records repairs and tuning attempts, as the owner permits. Human balance is unknown; do not describe the game as balanced.

Historical compatibility: `node scripts/legacy-browser-check.mjs` ran all30 original hide-and-seek cases:28passed, two failed. The readiness failure led to an inert legacy publication-order repair; its original test then passed in43.9s. The unchanged real-schedule trail case passed its isolated rerun in3.3min. These focused passes do not imply a fresh full30/30 run. The archived story suite ran24 original cases:22passed, invite timeout and world pickup failed. Focused retry1/2 in33.81s: invite passed; world pickup failed later at line80 after fixed560ms movement. Initial/retry results are preserved in `evidence/phase7/archived-story-first.json` and `archived-story-recheck.json`. The retired story retains this compatibility failure. No original assertion was removed or relaxed.

Art sampling now captures the renderer reference once and disables the debugger before frame measurements. The memory fixture compares an identical visible frozen roster across real director beginnings with rotating roles and alternating arenas. Positions follow seat identity, keeping the local camera fixed when the director reorders kids and geese. All original size, animation, conversion and strict no-growth assertions remain. The revised focused memory test passed in 24.76 seconds at 17 textures, 68 geometries and 15 programs, six figures and fixed 256-particle capacity across five measured cycles after six warmups. Earlier failed comparisons and periodic 67→68→67 counts are preserved. This is a bounded-resource fixture, not eleven full human rounds or a thermal endurance test.

Rare-feedback sampling received the same one-capture repair after its per-frame debugger missed the real120ms wind-up. A later full run still missed it; the cause of those misses is not proven. Added both-client rendered-goose readiness and bounded delivery/frame diagnostics. The diagnostic observed the tell on2/3phone/laptop frames, first79.5/48.6ms after trigger, delivered in34–36ms, un-frozen. It then exposed a real results bug: snapshots wrote final totals over the count-up every50ms. Results snapshots now leave score text to the existing animation loop; scoring and animation duration are unchanged. The test records the first visible frame, requires initial text, initial≠final and eventual final text. The focused revised case passed1/1 in27.78s, score40/0→736/10, full rare-response sequence/no errors. No gameplay timing was lengthened to satisfy the probe.

The fourth full run passed feedback but failed solo timing at5497ms. That check timestamped after locator/keyboard/poll-return work. Solo now records the first received occurrence of the same moving-goose/freeze predicate, keeps the5s/10s/3s limits and movement assertions, adds timestamp-presence checks, and reports polling delay. Play uses a measured real pointer tap, like the existing retry driver, after verifying the button is enabled; timing still begins before the tap. Focused result1/1passed49.10s: chase3.625/3.429s, freeze5.263/5.227s, retries1.812–1.877s. These are received authoritative-state timings, not first-visible-pixel or stranger-learning measurements. The earlier5497ms failure remains recorded; its exact first event time was not captured.

Fresh clean install/build/prune/compiled start passes exactly as DEPLOY.md describes, with audit0. No actual Railway/TLS/stop-first provisioning, Safari/silent-switch behaviour, physical fullscreen/wake lock/orientation lock, physical phone endurance, human fun/learning or loudspeaker audition was checked.

## Screenshots to inspect first

Start with the phone title, freeze, conversion and six-seat Cul-de-sac. The Park feels more detailed; Cul-de-sac exposes the remaining simple scenery. Required twelve views are indexed below; all have been opened for visual inspection alongside the supplied reference, including both independent multiplayer sessions' shared round/results checks.

| Moment |667×375|1366×768|
|---|---|---|
| Title |[Phone](evidence/phase7/solo/title-667.png)|[Laptop](evidence/phase7/solo/title-1366.png)|
| Solo chase |[Phone](evidence/phase7/solo/chase-667.png)|[Laptop](evidence/phase7/solo/chase-1366.png)|
| Freeze |[Phone](evidence/phase7/solo/freeze-667.png)|[Laptop](evidence/phase7/solo/freeze-1366.png)|
| Catch/conversion |[Phone](evidence/phase7/art/conversion-667.png)|[Laptop](evidence/phase7/art/conversion-1366.png)|
| Multiplayer |[Phone](evidence/phase7/network/multiplayer-667.png)|[Laptop](evidence/phase7/network/multiplayer-1366.png)|
| Shared results |[Phone](evidence/phase7/network/results-667.png)|[Laptop](evidence/phase7/network/results-1366.png)|

Also see [six-seat phone Cul-de-sac](evidence/phase7/arena/culdesac-six-667.png), [portrait hint](evidence/phase6/portrait-375.png) and [audio choices](SOUND_CHOICES.md).

Final subjective comparison scores (1–5), in the requested order character readability, kid/goose distinction, colour/light, frame use, HUD, excitement: Park **4/4/3/4/4/3**, Cul-de-sac **4/4/2/3/4/3**. The three weakest points are flat blue shading, foreground/character overlap, and simple broad road/house shapes with sparse Cul-de-sac action. These scores are visual judgment, not a stranger study. Phase4/5 each already used the permitted three review rounds and recorded fixes in PLAN.md.

Final environment follow-up: a per-process Chromium high-performance GPU request, retaining D3D11, selected the RTX 4050 and removed the multi-second stalls in the two short diagnostic samples. No global Windows graphics or power settings were changed. Seventh full run passed solo, feedback, memory, recovery, both full rounds and audio; its only failure was `UNKNOWN` opening the existing arena screenshot for writing, before later arena assertions. The arena test now accepts an evidence directory, with assertions unchanged; a new full run uses fresh `evidence/phase7/arena`. The sixth run disappeared without final JSON and remains incomplete. The earlier solo input/state gaps and wind-up misses remain observed failures whose cause was not conclusively established.

Final completed run: current-browser-final.json records 17/17 passes in 469.117 seconds, zero skipped, unexpected or flaky results. Arena evidence uses the fresh Phase7 directory with every original assertion. Resource measurements stayed at 17 textures/69 geometries/16 programs across five measured cycles, six figures and fixed 256-particle capacity; random seat IDs select different supplied models. Human infection to friend catch took 2.431s. Network freeze/catch times: 888/372ms at 100ms each way, 1891/890ms at 200ms; corrections 0/0 and 0/17. Latest audio: all 27 files decoded, thaw observed, one music layer after hidden return, no browser/network errors; no human audition.

After the final run all twelve required captures were reopened at both exact dimensions and inspected against the reference already reviewed. Controls, title and results fit; foreground feet, close conversion overlap and flatter blue lighting remain visible. Pixel analysis regenerated across all 33 Phase7 PNGs: maximum 0.00857888% near-black at the stated threshold. No screenshot was edited. Phase4/5 review limits/scores remain unchanged. Every section7 line is recorded above, including explicit limits where evidence cannot establish the quality target.
