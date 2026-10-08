# Flow verification: October 3, 2026

The functional milestone supports an incremental first-person 3D redesign, replacing the earlier painted 2.5D direction. The current scenes, lighting and synthesized audio remain temporary.

The October 3 audit follow-up replaces screen-wide redraws with stable DOM updates, permits hidden-tab play, and immediately transfers authenticated reconnects. See [AUDIT_FIXES.md](AUDIT_FIXES.md) for addressed findings and remaining work. Both completion paths use scene targets directly.

3D prototype results: `npm run build` passed, `npm test` passed all **12** rules/real Socket.IO tests, and `npm run test:e2e` passed all **19** Chromium browser tests in **2.9 minutes**. After review fixes for offline movement, interrupted dragging, and live neighbor beams, all six targeted world/recovery browser tests passed again. The final browser run was sequential with no concurrent source changes or competing artifact writers. A preceding overlapping run collided in Playwright's shared trace directory; the sequential rerun resolved that test-runner failure.

## Reproduce

With Node.js 22+, run `npm install`, `npx playwright install chromium`, `npm test`, and `npm run test:e2e`. The latter builds the client and runs Chromium against real Socket.IO servers. Its two-player paths use separate browser contexts and no multiplayer mocks. Development inspection resets only the test room's puzzle seed; the story progresses through ordinary player actions.

For a manual playthrough, run `npm run dev` and open http://localhost:5173 in two fresh tabs, independent browser contexts, or separate devices. Create a night, join its code in the other tab, choose Alex and Sam, and ready both players. When switching tabs, aim deliberately and use the ten-second beam handoff window. Use scene targets or labeled controls and contextual radio. Sam chooses whether to disclose the move. At the finale, keep both windows visible and signal together; side-by-side windows or separate devices are needed for that overlap. Matching ending votes replay with swapped roles or return to the lobby.

## Coverage

| Behavior | Verification |
| --- | --- |
| Create, join, role ownership, readiness, leave and replacement | Real browser lobby tests and real Socket.IO validation tests |
| Blackout and visibility | Both clients reach the same phase while connected; hidden tabs do not block readiness/actions, actual disconnect pauses opening, finale waits for visible overlap |
| Shared light and reciprocal puzzles | Both complete story paths observe the remote beam and perform both roles' required actions |
| Story branches and puzzle variants | Both endings in Chromium; all four seed/choice combinations in rule tests |
| Radio and keyboard | Contextual transmissions, Enter acknowledgment, stable input identity, draft/focus/selection and simulated composition retention, literal HTML/hostile names, real pointer and keyboard hold/release finale |
| Clipboard | Native system write/read, modern-only copy, denied-access selected-link fallback and friend invite join; in-app browser keyboard copy verified against the full invite |
| Recovery | Refresh, offline/online, 30-second visibility absence, game menu/resume, close/reopen invite with stored credential |
| Network switch with an old connection | Real TCP proxy cuts browser traffic while retaining the old backend socket; automatic reconnect and explicit Resume immediately transfer the same player ID |
| Server restart | Isolated server restart loses its room and offers a fresh start instead of trapping a stale screen |
| Responsive interaction | Portrait 390×844 and landscape 844×390; scene and objective in view, direct taps, no horizontal overflow, radio field focus |
| Interaction lifecycle | Held mouse press survives partner transmissions, existing date-card animation survives hints, invalid join keeps both fields, repeated offline entry queues one request |
| Replay and return | Swapped roles, reset inventory and variant, mismatched votes wait, matching lobby votes finish |

Visibility is explicitly emulated in headless Chromium because independent contexts do not reliably background each other. Clipboard denial and unavailable audio are injected only to verify their fallback behavior. The network-switch test uses real transport interruption, not a mocked socket.

## Practical limits

- Rooms are held in server memory. Refresh and reconnect recover while the server is alive; restarting it discards rooms.
- Invite links contain no credential. Fresh tabs can join separate seats; Resume or a remembered full-room code join transfers the saved seat to that tab. The older tab returns to title and does not automatically reclaim it.
- Hidden tabs can continue ordinary play; a beam handoff expires after ten seconds. Actual disconnection pauses progression. The game menu retains a seat; Leave this night forgets it. The finale requires both tabs visible.
- Physical iPhone/Android keyboards, touch scrolling, Safari, public-network latency and first-play duration require human/device playtests. Desktop mobile emulation does not establish them.
- The Codex in-app browser reports programmatic copy success without forwarding it to the system clipboard. The UI therefore says “Copy requested,” keeps the link selected, and explains keyboard/phone copying. Ctrl+C copies the full invite there; one-click system clipboard transfer is not established.
- No solo companion is included in the specified two-player skeleton. No public deployment or service purchase was performed.

Next: finish the remaining rules/hint and production-runtime audit findings before the painted 2.5D visual pass. Its reference scene remains the reciprocal garage-window puzzle.

## Opening house prototype

Two independent Chromium contexts rendered real WebGL bedrooms and sent authenticated movement through Socket.IO. The new test walks to the bedside table, observes the peer position, refreshes at the retained position, checks wall bounds, picks up both flashlights with E/the nearby prompt, and reaches the existing garage puzzle. It also checks that a partner snapshot preserves the canvas and that movement freezes while the local connection is offline. A separate transport test rejects invalid, unauthenticated, hidden, and excessive movement and retains the accepted position across credential replacement.

Only opening/flashlights currently use 3D. Each player has one walkable bedroom with procedural furniture and a neighbor avatar; later locations remain illustrated. Desktop WebGL and emulated mobile layout are covered; physical touch controls, low-end GPU performance, final assets, connected house rooms, and complete 3D conversion remain to be built. The production bundle currently produces Vite's size warning (about 614 KB uncompressed, 163 KB gzip); lazy-loading the 3D renderer is a later optimization.

## Solo exploration entry

The title now offers **Explore house solo** before room creation. `?solo=alex` and `?solo=sam` open the same 3D world without joining the multiplayer server. The solo browser test covers offline entry, walking to the table, E pickup, continued exploration after pickup, house switching, direct URL refresh, clean exit, and subsequent multiplayer creation. It verifies that exploration emits no room-creation request. Solo uses a local presentation snapshot and does not pretend to have a connected friend or advance the cooperative story.

After adding solo entry, `npm run test:e2e` rebuilt successfully and all **20** browser tests passed in **3.2 minutes**, including both full cooperative story branches and the independent-context 3D movement/recovery test.

## Home screen cleanup

The entry screen now uses a single title and direct solo, create, and join controls. Optional player names are collapsed by default, while room recovery appears only for a remembered seat. The pre-room radio status, repeated wordmark, duration/account instructions, development footer, placeholder keepsake glyphs, and solo development notes have been removed. Application strings and maintained project copy contain no literal em dashes; the supplied audit remains unchanged.

Fraunces 600 and DM Sans 400/600 are hosted under `public/fonts/`, together with their SIL Open Font License notices. The menu uses an original vector illustration separate from puzzle props. Browser checks cover desktop 1440×900, phone 390×844, compact 661×712, and landscape 844×390; they verify loaded local fonts, visible entry actions, collapsed optional name, absence of development copy/em dashes, and no horizontal overflow. Existing named-player tests open the optional name disclosure before typing.

Final cleanup verification: the full browser run passed **23 of 24** tests; its sole failure expected the old Resume label. After updating that assertion to Continue night, the complete remaining recovery test passed on a targeted rerun. All 24 current browser scenarios have passing results, with no runtime changes between the full run and rerun. The build passed.
