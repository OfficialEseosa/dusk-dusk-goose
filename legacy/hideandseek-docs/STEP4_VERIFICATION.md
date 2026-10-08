# Step 4 verification

October 4, 2026. One complete round only, running locally at localhost:5174. No deployment. No footprints, disturbed marks, false trails, freezing, radio, clues or scoring.

## What is playable

A solo player creates the same room, starts, explores the furnished preparation room and picks up a flashlight. The game selects a private capsule spot; pickup starts a two-minute search immediately. With two or more connected players, hiders rotate in original join order. The first round has a ten-second shared power-cut lead-in and 25 seconds of hiding after blackout. A human buries within 1.3 metres of an authored socket. Burial keeps the original hiding deadline; a missed or disconnected hider gets a valid server-selected burial at the deadline.

There are 24 public hiding sockets, four per house: mailbox, hedge/planter, porch corner and bin. Each socket is checked against shared street collisions on server startup. Added simple porch steps make the porch sockets recognizable. The preparation room uses the supplied bed, table, rug, books and boxes, plus flashlight meshes. It is a separate scene: seekers cannot see the street during hiding. Its light also switches off at the shared blackout. Missing a pickup at the hiding deadline grants a spare flashlight so the round can proceed.

The contextual right button offers Pick up, Bury here or Search, naming the nearby object. E performs the same action on laptops. Searches show progress and require two seconds. Early release cancels. A wrong search emits one shared sound event and starts a five-second cooldown for that seeker. A human hider remains on the street during seeking, without a flashlight or search action. Finding the capsule or timeout reveals it to everyone, including distant players and late arrivals, with a five-second camera view. Then the host can start again. Late arrivals can explore preparation and pick up a flashlight, but enter play only next round.

The canvas, stick, action button and HUD are persistent across messages and phase changes. Player labels avoid the round HUD. Refresh preserves seat, skin, role, phase, place and accepted position; an interrupted search is cancelled. Old action replies cannot reopen a room that the player has left.

## Server authority and capsule secrecy

Round state lives only in the single Node process. Server deadlines determine hiding, seeking and reveal. Server-owned capsule identity is projected through an explicit per-recipient allowlist. Before reveal, only the human hider can receive capsuleSpotId. Seekers receive no capsule identity, coordinates, secret seed or hiding-phase street positions. Public layout sockets describe all possible spots and do not select the capsule. Roster metadata carries names and presence without hidden positions.

Checked every received WebSocket frame on the seeker's browser through pickup, hiding, refresh, wrong search, cooldown and travel to the correct spot. **No capsuleSpotId field appeared before reveal; it appeared only when the successful search ended the round.** Independent real-WebSocket server tests inspect both room broadcasts and action-result snapshots for the same omission and confirm that the hiding hider is absent from preparation-room poses. Seeker-forged burial requests are rejected.

The server accepts search_begin only for an active seeker in range. It records its own start/deadline; search_complete before two seconds is rejected. Leaving range, cancelling, disconnecting or taking over a credential clears the hold. Correct completion checks role, place, phase, range, cooldown, hold and current round number. Repeated completion cannot reveal twice. All five action types require a matching round number, so delayed pickup, burial, cancellation and search packets cannot mutate a later round. Cooldown does not rely on a device-supplied time. The noise event ID is shared across recipients, and finder names survive a departure during reveal.

## Checks performed

Production TypeScript/client/server build passed. **17 server tests passed**, including all earlier room, credential, cleanup, production-route, speed, collision and path checks, plus full hold enforcement, wrong-result cooldown/noise, secrecy, one reveal, solo timeout, late admission, hider disconnect fallback, seeker resume, stale action replay and rotation after a hider leaves.

**All 16 browser tests passed.** Existing street tests were adapted to enter seeking through the real preparation flow; their previous movement, blackout, touch stick, collision, beam framing, label separation, refresh, late join, sound, frozen-page, takeover and restart assertions remain. A hider's hidden movements are intentionally tested remotely only once seeking begins. Late joins now correctly expect preparation rather than immediate street access.

Two independent Chromium contexts at 667x375 with touch enabled and 1366x768 completed a human round. The hider buried at a mailbox, refreshed and kept role/position. The seeker picked up, refreshed in preparation, reached seeking, cancelled an early hold, made a wrong search, refreshed during cooldown, then found the capsule. Both received the reveal, and the next round swapped hiders. A third arrival remained in preparation until that next round. Additional phone testing uses Chromium touch events for complete wrong and correct holds; keyboard E cancellation and progress are also exercised. The first cooldown snapshot is checked for at least 4.9 seconds remaining.

The solo browser check used the actual production two-minute timer, a real pointer hold/release, timeout reveal, next round, pickup and seeking again. It did not accelerate the clock. At 667x375 there is no scrolling, countdown/instructions remain readable, the left stick stays available and the right action is 118 by 96 pixels with 24-pixel bottom clearance. Inspected preparation, search, reveal and two-player beam screenshots at phone/laptop size.

Earlier local timing checks on this build: remote movement **125 ms**, shared blackout skew **1 ms**, silent browser-side drop recovery **869 ms** with the old server-side connection still open. Real restart checks return players to the ended-night title. Names alone still do not recover seats; duplicated tabs do not fight over one credential.

## Rendering and remaining limits

Six-player street rendering: two independent rendered contexts and four WebSocket test clients, measured for 30 seconds after seeking began. Maximum **69,094 triangle submissions including shadow passes, 79 draw calls and two shadow-casting lights**. Both viewports measured median **60 FPS**, frame-time p95 **18.6 ms phone / 18.2 ms laptop**, on Windows, Intel Core Ultra 7 155H / Intel Arc, Chromium 153.0.8010.12 using ANGLE D3D11. Raw metrics are in design/step4-six-player-metrics.json. A short preparation sample used 1,044 triangles and 32 draws; its startup-inclusive 37.5 FPS sample is not a sustained performance measurement. Rendering budgets and the shared ground-beam dimensions are unchanged.

A fresh two-context soak completed **601008 ms (10 minutes 1.01 seconds)** with **zero disconnects and zero browser errors**. It automatically started subsequent rounds after reveal, traversing hiding/seeking/reveal repeatedly and swapping roles. Every sample kept both seats Here and preserved the exact stick and action button elements across transitions. Median sampled FPS was 60 in both viewports. Raw evidence is in design/step4-ten-minute-soak.json. The run used the final presentation build, including the HUD/label separation adjustment.

Physical Android/iPhone frame rate, battery, heat, thumb comfort, mobile browser chrome, lock-screen behavior, cellular network switches and WAN timing remain unverified. Touch checks are browser emulation, not a physical handset. Two consistent flashlight slots cast shadows; additional beams can leak through solids as previously documented. The furnished room validates outer bounds but its decorative furniture has no walking colliders. Search sound is procedural and intentionally respects mute/hidden-page audio. The Vite bundle warning above 500 kB remains.

There are no interiors on the street, match-length rules or scores yet. This step supports host-started repeated rounds. Art remains the supplied blocky kit presentation, with simple porch/capsule/flashlight meshes. No new downloads or renamed assets were used. New screenshots are prefixed step4- in design; prior step 2 evidence was preserved. The next authorized step has not been started.
