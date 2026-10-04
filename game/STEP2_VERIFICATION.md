# Step 2 verification

The original step 2 record below is historical. The focused flashlight/camera/solid-object pass at the end supersedes its camera, shadow, label and collision limitations.

October 4, 2026. Street exploration only. No deployment was performed. Preparation, hiding, seeking, footprints, radio and scoring were not implemented.

## Running and testing

Use Node 22. From `game/`, run `npm ci`, `npm run build`, then `$env:PORT='5174'; npm start` in PowerShell. Open http://localhost:5174. Create a night with a name, then share its room code with another browser session. Start works alone. All players enter the same street; lamps switch off ten seconds after Start. Use WASD/arrows or the left thumb stick. Flashlights follow facing; Sound toggles audio. Back to title leaves your seat. Joining after Start and refreshing both return to the current street state.

Repeat automated checks with `npm test` and `npm run test:e2e`. With the production server running on port 5174, `node tests/step2-soak.mjs` repeats the ten-minute two-session check. Windows browser tests explicitly use hardware D3D11 through ANGLE; default headless Chromium otherwise selects SwiftShader on this machine.

## What was checked

- Two independent Chromium contexts: 667x375 landscape with touch enabled, and 1366x768 laptop. Inspected actual screenshots at both sizes. Both loaded the supplied Kenney models, animated characters, streetlamps and flashlight beams without browser errors.
- Start enters the street for both players. A solo player can enter. A friend joining after the power cut loads the street already dark. The server keeps the original blackout timestamp rather than restarting it.
- Local keyboard movement and facing reach the other renderer smoothly. Reports are sent at 20 Hz, snapshots at 10 Hz, with 100 ms interpolation of other players. Recorded remote movement latency was 115 to 171 ms across local runs. Recorded blackout skew was 0 to 1 ms. These are local measurements, not cellular-network guarantees.
- Dragged the real stick with pointer capture and confirmed movement. Its 116x116 target is 28 pixels from the left edge and 24 pixels above the bottom at 667x375. No scrolling, canvas clipping or offscreen controls. Stick identity remains unchanged across movement snapshots and heartbeat broadcasts.
- Refresh restores the same room, seat and saved position. Server tests separately verify stable character skin and pose through late join and credential takeover. A name alone cannot reclaim another seat. Different tabs can still create separate players.
- Tested a silent connection drop on the street using a TCP relay. Destroyed only the browser leg, leaving the server leg open and suppressing its FIN, RST and WebSocket close. The replacement connection reclaimed the seat in 877 to 880 ms across recorded runs, before the stale server connection expired. Position was preserved and the other player saw Here. This was not a clean-close simulation.
- Froze one browser with Chromium's page-lifecycle API. The other player continued walking and experienced its blackout on schedule. Reactivating the frozen browser caught it up to the dark street.
- Instrumented Web Audio: no AudioContext before a gesture, running context after the first tap, audible-path hum gain before blackout, hum gain approaching zero after blackout, one click buffer at the cut, cricket oscillators and working mute control. Audio is synthesized; speaker quality and the subjective cricket sound were not checked on a physical phone.
- Server tests cover separate movement allowance, a sustained 20 Hz stream, control requests during movement, rejection of teleportation, boundaries and replayed sequence numbers. Production static serving, forbidden development routes, capacity, cleanup and restart behavior remain covered.

## Ten-minute run and frame rate

Completed 600983 ms (10 minutes 0.98 seconds) with two independent sessions: zero disconnects, zero browser errors, both seats Here throughout, and unchanged stick elements across all 60 samples. Chromium 153.0.8010.12, Windows, Intel(R) Core(TM) Ultra 7 155H, hardware ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11).

667x375: median 60 FPS; sampled range 58.2 to 60.6 FPS; cumulative frame-time p95 18.1 ms; 18812 rendered triangles and 115 draw calls.

1366x768: median 60 FPS; sampled range 57.8 to 60.6 FPS; cumulative frame-time p95 18 ms; 19360 rendered triangles and 120 draw calls.

Renderer data measures actual animation callback intervals, not an inferred display refresh rate. The first default-headless run used SwiftShader and measured roughly 4 FPS; that run was stopped, hardware rendering was explicitly selected, and the complete ten-minute run was restarted. Neither result establishes Android performance. Saved summary: ../design/step2-measurements.json.

Final checks: production build passed, all 8 server tests passed, and all 11 browser tests passed together. Final browser run measured 171 ms remote movement, 1 ms blackout skew, and 877 ms silent-drop recovery.

## Visual comparison and limits

See `../design/step2-mood-comparison.png` or `../design/STEP2_COMPARISON.html`. The actual screenshot is unedited. The raised camera, houses above the sidewalk and road, dark blue setting, foliage framing and warm beams match the direction. The current scene is substantially simpler than Mood A: blocky characters, sparse geometric foliage, flat kit materials, less detailed porches and gardens, and harder light pools. Only the local flashlight casts shadows; other flashlights still illuminate surfaces. Transparent cone geometry suggests haze rather than rendering atmospheric scattering. Close player labels can overlap.

The next visual improvement should be a phone-tested environment pass: richer tree and hedge silhouettes, compact ground-detail atlases, authored materials and baked ambient shading, then softer beams and character upgrades within the measured rendering budget. No additional packs were downloaded or renamed for this step.

Physical Android/iPhone frame rate, touch comfort, browser chrome/safe-area behavior, lock-screen recovery, Wi-Fi-to-cellular switching, WAN blackout synchronization and thermal/battery behavior remain unverified. Receipt-time clock alignment can add one-way network latency to blackout timing. There are no house interiors or house/prop collision navigation in this street step. The production bundle includes a Three.js chunk over Vite's 500 kB warning threshold. No Railway deployment or public endpoint was used.

## Focused flashlight, camera and solid-object pass

October 4, 2026. No deployment and no hide-and-seek mechanics. Only the requested street presentation, collisions, labels and verification were changed.

### What changed

- Removed the translucent cone meshes. Genuine warm spotlights now light ground and props with a soft penumbra. A single shared world-space profile defines all players' beams: 12.5 metre outer range, 0.40 radian half-angle and 0.55 penumbra. Camera size does not change the beam. Authored constant distance falloff avoids the old near-wall intensity spike. The two lowest occupied character slots cast shadows consistently on every device; additional beams still illuminate surfaces but do not cast dynamic shadows.
- At 667x375, the camera projects a 1.65 metre character to 63.29 pixels vertically. It looks farther ahead while keeping a close phone view. Laptop framing remains wider. Raised blue hemisphere/moon illumination makes unlit buildings, cars and road edges readable.
- Shared static collision envelopes cover cars, grounded lamp poles, tree trunks, planters, mailboxes and houses, with 0.30 metre player clearance. The client slides along solid faces. The server validates the whole reported path and its total distance, not just the endpoint. Bounded substep traces preserve legitimate corner sliding. Pole envelopes are aligned with the actual grounded model, not the centre of its overhead arm. House envelopes are conservative exterior bounds; there are no interiors.
- Persistent name labels separate into unobstructed rows when characters stand together. Long names are truncated to fit. No HUD or control remounting was introduced.
- Static meshes share merged palette batches. The supplied characters keep their full animation hierarchy while their six rigid limbs draw as one dynamic mesh each. Actual animated geometry and shadows are preserved; no character assets were replaced.

### Checks performed

Production build and all 13 server tests passed. All 13 browser tests passed on the final batched rendering build, including every earlier step 2 check.

Two independent browser contexts at 667x375 and 1366x768 verified movement, facing, shared blackout, drag stick, no scrolling, refresh, late join, hidden/frozen-page independence, seat takeover, first-tap audio and persistent controls. Final local timing: remote movement 117 ms, blackout skew 1 ms, silent-drop recovery 868 ms. The silent-drop relay still left the server connection open rather than sending a clean close.

Actual keyboard walking stopped at a car, pole, tree, planter, mailbox and house; movement away worked in every case. Shared tests check occupied footprints and player clearance for all 30 bodies. Real WebSocket tests reject forged occupied endpoints for every solid class, crossing a pole with clear endpoints, forged corner paths, oversized traces and excessive path distance. A legitimate corner trace succeeds.

The production restart browser test now starts both players on the street and moves a character before killing and restarting the separate Node process. Both return to the title with “The street has gone quiet after a restart. Create a new night to play again.” Their room URLs clear and Create works again.

The phone screenshot shows two players with warm ground and house illumination after the power cut. Inspected the phone and laptop screenshots. Checked projected character height, matching beam profiles between devices and non-overlapping close-player label rectangles.

### Performance and limits

A fresh two-context connection run completed 600813 ms (10 minutes 0.81 seconds), with zero disconnects or browser errors and stable controls throughout. Console samples stayed around 60 FPS. This run covered the new collision/path protocol before the final character draw batching; it was not repeated for ten minutes after that rendering-only optimization.

Final six-player rendering was separately measured for 30 seconds: two independent rendered contexts and four WebSocket test clients, with both shadow casters aimed through the group. See `../design/flashlight-pass-six-player-metrics.json`. The recorded scene used at most **69,054 rendered triangle submissions, 80 draw calls and two shadow-casting lights**. Triangle submissions include shadow passes. These are below PLAN.md's roughly 100,000 triangle and fewer-than-100-draw budgets. Both viewports measured median **60 FPS** on Windows, Intel Core Ultra 7 155H / Intel Arc graphics, Chromium 153.0.8010.12 using ANGLE D3D11. The final metrics file includes frame-time p95 and hardware details. The initial six-player attempt reached 153 draw calls; character batching resolved that budget failure.

No physical Android/iPhone frame-rate, thermal, battery or touch-comfort claim is made. Six actual phones, cellular latency, lock-screen recovery and near-wall lighting on other GPU/browser combinations remain untested. The earlier network clock-alignment limitation remains. Dynamic occlusion is limited to two consistent beams; additional beams can illuminate through an intervening solid. The future reveal system must respect this explicit rendering limit. No footprint visibility or wall filtering for clues was built in this pass.

New comparison: `../design/flashlight-pass-mood-comparison.png`, with source page `../design/FLASHLIGHT_PASS_COMPARISON.html`. The game remains simpler than Mood A: blocky proportions, sparse foliage, flat surfaces, teal kit roofs, limited garden detail and no atmospheric scattering. The closer phone framing crops more of the houses than the reference's broad diorama. Bright facade areas are still stylized rather than subtle cinematic lighting. The next visual pass should address materials, foliage and physical-phone tuning; mechanics were not started.

Repeat the render budget check with the local server on port 5174 using `node tests/street-render-budget.mjs`.
