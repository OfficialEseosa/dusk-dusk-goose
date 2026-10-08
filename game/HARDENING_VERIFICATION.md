# Phase 6 hardening evidence

All checks ran locally on Windows 11 / Node 22. No deployment, downloads or physical phone testing.

| Area | Evidence and limits |
|---|---|
| Recovery | `tests/chase-recovery-states.spec.ts`: private seat refresh in solo, joining, countdown, playing and results; second client advances; real server restart returns both to friendly title and clears stale credentials. Stage-holding fixture isolates recovery; normal full rounds are separate checks. |
| Silent drop / hidden | Actual dropped relay reconnects automatically. Hidden/portrait input stops and the server covers the seat after 1.5s; landscape recovers the same seat. |
| Display | `evidence/phase6/display-check.json`, portrait and landscape PNGs: 375×667 portrait hint, 667×375 and 1366×768 shared room, no scroll, controls in bounds and ≥44px, dismissible unsupported-fullscreen tip. Fullscreen rejection is stubbed; native fullscreen, orientation lock and wake lock remain unverified. |
| Second arena | `arena-check.json` and Cul-de-sac PNGs: 4/6-seat choice, 3 lamps/3 pickups, same identity after refresh, circular pond movement/light distinction, two 3×4 notches and 2.6m back alleys. Alley capture verifies foreground house cutaway. Fixture advances round boundaries; it does not measure human balance. |
| Resources | `memory-cycles.json`: 6 warmup and 5 measured arena/roster cycles, fixed 256-particle pool; settled textures/geometries do not grow. 14 shader programs exceeds research's suggested 8-program budget. This is a fixture cycle, not a physical-phone endurance test. |
| Timing | `frame-timing.json`: 20s live samples without debugger/readback, Intel Arc D3D11. Latest laptop59.95FPS/16.68ms mean/16.8ms p99; phone-sized56.93FPS/17.57ms mean/16.8ms p99, 409×230 backbuffer, worst450.1ms. Earlier severe 7.31FPS phone sample and other variable readings remain in PLAN.md. No claim of steady mid-range-phone FPS. |
| Adaptive quality | Three deterministic tests cover caps, bounded degradation/recovery, active >250ms stalls and exclusion of hidden-return gaps. Pointer/DPR fallback plus title benchmark replaces GPU-database detection; no settings button added. Low reduces resolution/particles/cones/fireflies while retaining the original antialias context. High uses shader beam lighting rather than an additional shadowed spotlight. |
| Delayed play | `network/latency-100.json` and `latency-200.json`: human freeze, lunge, infection and converted pursuit pass at 100/200ms each way. Corrections0/4 and0/13 respectively; retained as a visible network limitation. |
| Art regression | `art/render-metrics.json`: phone kid72.74px/laptop136.46px; animation/waddle, draining ice ring, catch hold/pop and fixed-pool effects observed. Title54draw calls/50,011triangles/12programs. Still flatter than the reference; nearby geese/foreground objects can overlap figures. |
| Production | Fresh isolated install/build/prune/compiled start passes, zero audit vulnerabilities, HTTP and WebSocket work, restart is friendly, development/debug routes404. Exact commands and single-instance hosting constraints in DEPLOY.md. Railway/TLS/stop-first provisioning unverified. |
| Archive | Retired root story source/tests/docs under `../legacy/story`; unused hide-and-seek assets/docs under `../legacy/`. Original hide-and-seek tests run against a separate compiled fixture. Original assertions retained; source repairs fix legacy collision safety/slow-frame movement/caption parenting. |

Balance targets and attempts are recorded in PLAN.md and the final 500-seed report. Automated computer play is not a human fun or first-time-learning study. Sound files decode and produce signals; perceived mix and loop seams need listening on actual devices.
