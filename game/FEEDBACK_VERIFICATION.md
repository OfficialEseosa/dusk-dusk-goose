# Phase 5 feedback verification

The complete feedback list is implemented. This ledger separates implementation,
measured browser evidence and limits. The server decides movement, catches,
freezes, pickups and scores; visual timing never changes those rules. Normal
play is covered by the solo/full-round/infection tests. Rare moments are also
covered with a test-owned server fixture, with no production debug endpoint.

| Moment | Feedback | Evidence |
|---|---|---|
| Nearby / first goose | Directional pulsing danger edge, paired eyes, arrow/name, heartbeat bands, spawn honk/vibration | Chase stills; source audit for distance/pulse bands |
| Light / dwell | Hand-held torch/holding clip, shader cone/motes/ring drain, switches/hum; reveal/sparks/fizz | Real solo freeze path; all audio decodes and produces signal; no separate dwell pixel test |
| Freeze / thaw | Cyan cracked statue, draining ring/FROZEN +25; zap/squawk; steam/open ring/shield/drop/hiss | Art probe at both sizes; once-only server thaw regression; actual thaw audio source observed |
| Lunge / miss / near | Direction streak/flared eyes; dust/stars;80ms kid animation slowdown/CLOSE +50; honk/deflation/whoosh/gasp | Rare fixture measures tell, stars and slowdown; source audit for audio |
| Caught / conversion |90ms pose hold, flash/zoom/shake, squash, feathers/ring, springing goose pop,650ms catcher recoil, role card, honk/poof/vibration | Real server catch: art probe observes hold/pop/particles; compositor captures saved; overlapping figures remain a still-image weakness |
| Catch actor / others | Named +300 message / named catch feed, kids-left bump, distant honk | Three-human infection catches the friend in<3s; actor text/audio wired, no separate message screenshot assertion |
| Dropped flashlight | Six reused falling/spinning torch meshes | Source capacity/trajectory audit; not independently measured |
| Low / empty battery | Matching beam/cone flicker, dashed LOW ring, EMPTY text, beeps/power-down/vibration | Rare fixture asserts both labels; low-battery screenshot |
| Pad / collection | Glow pillar, low-battery arrow, respawn chime, +50/ring refill, power-up/vibration | Rare fixture uses actual pickup rule and checks refill; respawn chime source audit |
| Lamp | Occupied pool, final1.5s flicker, confirmation/power-down | Rare fixture observes live countdown, flicker and expiry |
| Last kid | Banner/refill, pulsing marker, goose target arrow/brows, sound accent/vibration | Actual one-kid rule in fixture; marker and target arrow assertions |
| First Light / final10 | Warm sky/moon, NO RECHARGE warning, pulsing centred numerals/rising ticks/vibration | Both independent clients reach authoritative shortened deadline; screenshots/bounds |
| Dawn | Warm wash/sky, eyes disappear and geese waddle away, YOU MADE IT, chime/stinger/vibration | Fixture observes>0.5m walk-off and dawn results in both sessions; normal full-round dawn separately tested |
| Flock | Delayed eyes overlay then results, chorus/stinger/vibration | Normal solo catch and results; source/earlier overlay screenshot audit |
| Solo best / hour | Gold timer/message/chime; hour flash/refill/chime/vibration | Solo best/retry/storage browser checks; director milestone unit tests; no separate milestone sound audition |
| Roles / results | Persistent animated role cards, named scores count up800ms, music stops for stinger then lobby | Card bounds/screenshots; score fixture checks intermediate and exact server final total |
| Join / leave | Joining notice; seat-count pluck / lower drop | Two/three-context room flow; source audit for cues |
| Reconnect | Reconnecting text/glitch; clears on resumed seat | Silent browser-leg drop/live stale credential takeover; text appearance/clearing verified in final focused run |
| Ambient |20 fixed drifting fireflies, lantern flicker, gait/idle/arm clip, footsteps, crickets fade near geese | Mixer/neck measurements and living title; graph/mute/hidden-return checks |

Particle capacity is256, impact rings8, dropped torches6. The generated puff and
feather atlas is128x64; ground grain is128x128. All are generated in code. Audio
is27 supplied MP3 files/1,800,004bytes (1,802,651 with licences), below3MB. No
assets were downloaded. SOUND_CHOICES.md lists all files and synthetic substitutes.

The near effect slows only the kid animation, preserving immediate input and
other players. Camera shake/zoom respect reduced-motion preference. Synthesized
honks/noise/dawn chime replace unavailable recordings. These are deliberate
implementations, not claims of identical recorded sounds or global slow-motion.

Three scored Phase5 visual rounds are recorded in PLAN.md. Final visual scores are4/4/3/3/4/4 in the requested order. Stills cannot prove
the gag motion: the art probe verifies actual hold, model-role change, scale pop,
ring drain and particles. Full-scene stills can still obscure the small emerging
bird behind the catcher. The world remains simpler/flatter than the supplied
reference. Physical phones, Safari, loudspeaker balance, perceived fun, loop
seams and first-time human comprehension have not been tested. Frame-rate and
quality-tier evidence are Phase6 work; debugger measurements do not prove FPS.
