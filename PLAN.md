# Dusk Dusk Goose — living build plan

## Progress

- [x] Phase 0 Prepare: read owner request and research 00–04, 06; view five reference images; replace AGENTS.md; tag old HEAD; choose reusable systems.
- [x] Phase 1 The chase: shared Park collision/tuning; server bots, auto-aim light, freeze, committed lunge, catches, battery/pickups; playable plain-shapes 3D client; 500-round-per-count balance report; rules tests and browser smoke. Balance misses and attempts recorded below; not a balance pass.
- [x] Phase 2 Solo: instant Play, first-ten-second approach, escalation/director, milestones, local best/run storage, retry under2.5s; timed browser evidence.
- [ ] Phase 3 Multiplayer: mid-solo joining, rotation, filler kids, infection,75s/finale, scoring/results/rematch; stale/hidden cover, fair catches; two contexts.
- [ ] Phase 4 Look: kit kids/props, code goose, Park dressing, bright blue October night/warm beams,56px characters, living title/HUD. Scored visual comparison and three weakest fixes, up to three rounds.
- [ ] Phase 5 Feel/sound: research04 section9 feedback and03 section9 effects, synthesized honks, prepared audio manifest under3MB, animation/event measurements; scored visual comparison/fixes.
- [ ] Phase 6 Hardening: all-state reconnect, hidden tabs, quality/frame measurements, Cul-de-sac for4–6, fullscreen/orientation, clean install/build/start, game/DEPLOY.md, retired root cleanup.
- [ ] Phase 7 Final: server tests five consecutive passes; all browser tests including silent drop/refresh; full rounds/retry timings; title/solo/freeze/catch/multiplayer/results screenshots at667x375 and1366x768; every good-means item recorded; final report.

## Decision Log

- Owner attachment supersedes old finishing authorization and permits AGENTS replacement. Old HEAD preserved as tag old-game-end-f802515. No deployment/downloads/research edits/history rewrite/accounts/database/chat/third arena/extra play buttons.
- Authority: attachment > AGENTS > research00 > other research. Research read once; this plan preserves key decisions for continuation.
- Keep Node/TS/Vite/Three/ws, one-port static serving/origin checks, room limits, credential takeover, heartbeat/retry patterns, movement path validation, persistent controls, independent-context and silent-drop test methods. Replace capsule/search/radio/prep/trails and long street.
- New chase modules and tests coexist with inert legacy source initially. Retain old tests unchanged until Phase6 retires obsolete product coverage with replacement coverage. Production switches to chase entry in Phase1.
- Lunge04 rules win over03 visual timing: windup.12s,dash3.2m/.22s,recovery.5s,cooldown2.5s. Research00 overrides04 lobby/Ready: Play begins solo; friend moves immediately; solo ends early with clear notice and multiplayer starts at break.
- Core: kid5m/s,lit4.25; human goose5.5,filler5.25. Beam9m/40deg,aim300deg/s,dwell.25(first solo.1),freeze1s,immunity4s. Battery100,drain20/s,freeze25,recharge4/s after2s off,min10. Pickup50/8s,2 Park/3 Cul-de-sac; lamps5s occupied/20s cooldown.
- Solo spawns1.5/10/20/32/45/60 then15s intervals to10. Chaser/Cutter/Pincer/Lurker. Speed92% kid +2% every15s to112%. Milestone30s refill/stun1.5. Retry gag.6s/card1.2s/action by2.5s,automatic4s. Local best/score/runs,date seed. Threat by5s/freeze opportunity~3.5s.
- Multiplayer at least4 participants, starting human goose rotates,2 at6 humans;3s+75s,finale15s recharge stops/goose+8%; last kid speed+8%,refill,double survival. Score10/s,500dawn,25freeze,50near miss,10pickup,300catch+100starting first,250goose win. Conversion.6s/no catches1.5s. No spectators.
- Fairness: passive overlap2ticks,lunge rewind150ms,beam200ms,freeze wins50ms grace; bounded500ms histories. Devices move humans/server moves bots. Speed-credit bucket and full collision path. Stale1.5s bot cover,seat20s,empty room60s,max25rooms/6seats/10bots.
- Look viewed: raised layered diorama/blue moonlight/warm cones, but replacement brighter/more saturated/bigger kids. Pumpkins/iron fences/pines; no graves/coffins/crypts. No post passes.56px phone kid takes precedence over coverage,edge-eye warnings compensate;under10%near-black. Ship selected disk assets only with manifest.
- Use available fonts if suggested Baloo/Nunito absent; no downloads. Prepared MP3 + synthesized nasal honk/hiss/flap, exact choice manifest for owner audition; do not claim listening without listening.

## Surprises

- Goal auto-created from attachment pointer; create_goal rejected unfinished goal. Continue actual attachment objective; do not mark complete just for reading.
- Root has retired story-game sources/documents too; cleanup Phase6 after replacement works.
- File05 is05-chatgpt-workflow.md; located/read plan guidance. Combined reads exceeded tool output budget; bounded reads recovered implementation sections.
- No physical phone/human test yet. Emulated dimensions cannot establish Safari audio, physical phone FPS, thumb comfort or first-time learning. Report limits.
- Initial PLAN patch failed because delete/add same path unsupported; no source changes lost.

## Results

- Phase0 git status clean; HEAD f802515; origin OfficialEseosa/dusk-dusk-goose,main.
- Copy-Item research/NEW-AGENTS.md AGENTS.md succeeded; git tag old-game-end-f802515 succeeded.
- Required research read and five reference images inspected; no research edits/downloads.
- Phase0 commit e3fcd39 and tag old-game-end-f802515 both pushed successfully to origin.
- Phase1 (in progress): added shared collision/tuning, deterministic server simulation, separate one-port chase server, persistent phone/keyboard controls and plain Three.js client; production entry now chase-server.js/chase-main.ts. Legacy implementation and tests remain intact and inactive in production.
- `npm run build` passed twice (TypeScript client/server and Vite). Vite warns main JS is ~534KB uncompressed/~136KB gzip; defer code splitting to hardening if measurements justify it.
- `npm run test:chase`: 10/10 passed (collision sweep, beam auto-aim, wall occlusion, freeze cost/immunity, passive catch grace, freeze priority, lunge timing/cooldown, battery economy, deterministic bounded events, real WebSocket rooms/teleport rejection/credential takeover/origin and room cap).
- `npm test -- --test-reporter=dot`: retained server suite34/34 passed in48.8s; argument placement still emitted TAP. No old tests deleted or weakened.
- `npx playwright test tests/chase.spec.ts`:1/1 passed in12.8s. Test creates independent contexts at667x375 and1366x768, starts solo, moves/holds light, joins same code as goose, checks role buttons/no overflow/action bounds/no browser errors.
- Saved and inspected game/evidence/phase1/title-{667,1366}.png and chase-{667,1366}.png. Phone screenshot shows freeze event, readable HUD and reachable116px stick/100px action. Neither screenshot is near the final visual bar: empty flat surfaces, basic characters, no October dressing, weak beam shape. Phase4 must address these; current evidence establishes plain chase only, not commercial quality or physical thumb comfort.
- First30-run balance sample exposed invalid default spawns inside hedge: kid wins90% at2–5 and0% at6, first catch6.4–7.15s, solo15.05s. Fixed spawn validation and BFS goal rounding/navigation; second30-run sample: kid wins3.33% at2–4/6.67% at5/0% at6, first22.95/22.7/17.6s, solo22.8s. Targets still missed. Full500 runs per count and one-parameter bot-speed5.1 experiment pending; no claimed balance pass.
- Found refresh sequence reset would make resumed inputs replay-rejected; seat reply now carries nextSeq. Recheck pending.
- After sequence fix, `npm run build`, `npm run test:chase` (10/10), and `npx playwright test tests/chase.spec.ts` (1/1,9.7s) all passed again. Default npm test now includes chase tests alongside every retained server test.
- One-number experiment `npx tsx scripts/balance.ts 30 --goose-speed=5.1` saved to game/evidence-balance-speed51.json: kids win30% at2–4,16.67% at5,0% at6; median first catch26.7/23.9/23s, solo22.8s. Lower speed improves survival but worsens first catch and does not fix six-player snowball. Keep original5.25 until director/last-kid mechanisms and second arena exist; do not tune to a bot-only metric by giving bots false outcomes. Those missing later-phase mechanisms materially affect final balance. Final pass must rerun the same report and explain any remaining misses.
- Full `npx tsx scripts/balance.ts 500 > evidence-balance-phase1.json` completed successfully (2500 multiplayer rounds +500 solo runs). At2/3/4 humans: kids win2%,first catch22.9s,median round35.55s,zero catches.2%. At5:3%,22.7s,40.9s,.2%. At6:0%,17.25s,22.35s,0%. Solo median22.75s. Only zero-catch target passes; kid35–45%,first10–15s,solo35–50s all miss. Two-player round>40s target also misses. This is a recorded baseline, not finished balance. Spawn/navigation repairs and slower-goose experiment are the attempts so far; director, last-kid relief, lamps and second arena remain to be integrated before final tuning.
- Phase1 checks complete under owner's explicit allowance to record missed balance targets and attempts. Commit8169b5b pushed to origin/main. Game currently has no production art/audio, full multiplayer round rotation, lag rewind or final hardening; do not claim overall completion.
- Phase2 in progress: added SoloDirector used by real server and balance runner: first spawn1.5s, four personalities, daily seed/pickup shuffle, escalation to10, intensity breathers,30s refill/stun/multiplier; first-ever easy dwell is consumed once. Client saves validated best/time/score/runs, automatically uses cosmetic torch rewards, shows action attention/edge threat/invite/results, and queues an early retry for1.8s after catch (automatic4s). Persistent action children now update as text rather than rebuilding content.
- Phase2 `npm run build` passed; `npm run test:chase`16/16 passed; `npm test`50/50 passed in48.07s before adding the empty-room regression. Latest regression and browser changes require recheck before commit.
- Phase2 initial100-seed sample (game/evidence-balance-phase2.json): kid win0%, first catch~7.55s, solo14.5s. Bot release fix: computer kids had kept draining into frozen/immune geese; corrected.30-seed release sample (game/evidence-balance-phase2-release.json): kid win43.33% at2–4/20% at5/0% at6, first7.55/7.6/8.75s, zero catches30/13.33/0%,solo14.6s. Solo remains far short of35–50s target; bot navigation/pressure and later multiplayer relief need more tuning. This is not a claimed balance pass.
- Browser timing trial passed once: chased3.28s phone/3.23s laptop, first freeze5.10/5.17s, two retries per device1.31–2.37s, saved2 runs and restored seat after refresh. Subsequent trials failed: movement after screenshot1.48m or0m, one freeze wall timing14.93s despite sim elapsed~4s. Do not treat single prior pass as final proof. Screenshot capture moved into a separate evidence test; all timing/movement assertions retained. Input transport moved to its own50ms timer so GPU work cannot stop reporting. Current browser test has diagnostic event/frame capture to resolve remaining intermittent movement loss.
- Browser sequence also exposed genuine crash after last seat expiry: auto-retry accessed an absent first seat. Guarded empty-room restart and added a direct regression; must rebuild/retest the fixed compiled server. Evidence capture test itself passed at both sizes; full combined browser run was not green.
- Viewed Phase2 phone results/chase and laptop freeze shots: HUD/results fit; plain world remains empty/undressed and beam is weak (Phase4). Physical phone, first-time human learning and Safari remain unavailable.
- One command accidentally ran the retired root `npm run build`; it passed but is not replacement verification. Correct game build was then run. A test command used a short-lived Windows execution-state request to keep the machine awake, with reset in finally; no power settings were changed. Cause of browser timing stalls remains unproven.

### Final acceptance ledger (research00 section7)

- Phase2 final checks: `npm run build` passed; `npm run test:chase`18/18 passed including empty-seat and catch/retry race regressions. Earlier combined `npm test`50/50 passed before those two regressions were added; no claim of a52-test combined run yet. `npx playwright test tests/chase-solo.spec.ts tests/chase.spec.ts`3/3 passed after final HUD fixes in57.8s. `git diff --check` passed.
- Final scripted timings (game/evidence/phase2/timings.json): phone chase3.284s/freeze5.051s/retries1.861,1.847s; laptop3.268s/5.019s/1.816,1.833s. Zero movement corrections. Both saved two runs and restored best/seat on refresh. This verifies a scripted path, not first-time human learning.
- Inspected phone freeze and both results layouts: fixed results/message overlap and HUD shrinking. Phase2 catch files actually show results because capture latency exceeded the conversion gag; they are not proof of visible conversion. Phase5/7 must obtain actual conversion evidence. World still plain and empty; no physical phone, Safari or audio audition checked. Phase2 balance misses remain documented above. Phase2 complete; Phase3 is next.

- [ ] Kid/goose distinguishable in1s at667x375 (visual evidence; human limit).
- [ ] Under10%near-black (pixel measurement).
- [ ] Move/light/freeze/flee within10s (timed scripted path; human learning separate).
- [ ] Catch/freeze/near miss/pickup/conversion visible/audible (event checks/audio limitations).
- [ ] Converted player chases nearby friend (two contexts/full round).
- [ ] Laptop60FPS/physical mid-range-phone steady tier (measure available hardware/report missing phone).
- [ ] No scroll/clipping,>=16px text,>=44px targets at667x375 (geometry and inspection).
