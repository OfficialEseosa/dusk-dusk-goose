# Step 2 verification

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
