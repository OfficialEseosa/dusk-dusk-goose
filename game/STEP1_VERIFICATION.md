# Step 1 verification

Checked October 3, 2026 against the fresh `game/` production build, served by compiled Node JavaScript. No Railway deployment was performed.

## Browser checks

Playwright Chromium used independent browser contexts at 667x375 landscape phone and 1366x768 laptop size. Additional cases used 568x320 with touch emulation, including six simultaneous players. Title and room screenshots were opened and visually inspected; agent-browser independently opened the running title and created a room.

- Create alone and Start enabled; solo Start changes server-owned room phase.
- A second independent session joins by code and both player lists update.
- Host Start changes both screens to the same started room state.
- Clipboard success was verified by reading back the actual clipboard link.
- Clipboard denial shows a selected, usable invite field and an honest manual-copy message.
- Back to title removes the seat from the other player's list and clears the room URL.
- Refresh restores the same player and room.
- Two tabs in one browser receive distinct seats; a new tab can recover a disconnected browser-owned seat with its private credential.
- A copied-tab credential cannot take over a connected seat; that tab can join as a different player.
- Repeated page-cache return events create one replacement connection, preserving the same seat.
- The same display name in another browser is not a recovery credential.
- A seventh player gets a readable full-room message.
- Empty-name and invalid-code errors leave the controls usable.
- Six-player 568x320, two-player 667x375 and 1366x768 controls remain within the viewport; buttons are at least 44 CSS pixels high; no document scrolling.
- An actual compiled server stop/start with two open sessions returns both to the title with a restart message and clears the stale room URL. Create is enabled again.

## Server and asset checks

Six Node integration tests cover solo/shared state, private credentials, disconnected-only recovery, host reassignment, room/six-seat caps, expiry, a fresh server identity after restart, production static serving, foreign-origin rejection, and absent debugging routes. Tests use short configurable cleanup intervals rather than waiting ten minutes.

Production build, six server integration tests and seven browser scenarios passed.

Asset intake validates all 43 selected original model paths, dependencies and five CC0 licences. The 52 selected model/texture export hashes match their manifest; models match their source files. Selection totals 2.16 MiB. No source filenames were changed, and no recommended Quaternius replacement was downloaded or used.

## Limits

No physical Android/iPhone, software keyboard, heat, actual thumb reach, different cellular networks, Railway proxy or long-duration production load was checked. Browser touch emulation and control geometry do not establish physical-phone comfort or GPU performance. The 25-room setting is a safety cap, not proven public capacity.

Step 1 has no street renderer, movement, preparation room, lights-out, flashlights, soundscape or round mechanics. Start is a real synchronized room transition, not a playable night yet. Those belong to step 2 and later. Mood A comparison is due at the end of step 2. This request stops here.
