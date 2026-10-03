# Flow verification — October 3, 2026

The functional milestone precedes the screen-by-screen painted 2.5D redesign. The current scenes, lighting and synthesized audio remain temporary.

Final local results: `npm run build` passed; `npm test` passed all 9 rules/real Socket.IO tests; `npm run test:e2e` passed all 12 Chromium browser tests in 2.2 minutes. Both completion paths used scene targets directly. An independent code review found the display-name escaping and explicit-resume retry defects; both were fixed and included in the final browser regressions.

## Reproduce

With Node.js 22+, run `npm install`, `npx playwright install chromium`, `npm test`, and `npm run test:e2e`. The latter builds the client and runs Chromium against real Socket.IO servers. Its two-player paths use separate browser contexts and no multiplayer mocks. Development inspection resets only the test room's puzzle seed; the story progresses through ordinary player actions.

For a manual playthrough, run `npm run dev` and open http://localhost:5173 in a normal window and an incognito window or a different browser. Create a night, copy its invite into the other window, choose Alex and Sam, and ready both players. Keep both windows visible. Use scene targets or labeled aim/interaction controls and contextual radio to solve the puzzles. Sam chooses whether to disclose the move. At the tower, both friends signal together. Matching ending votes replay with swapped roles or return to the lobby.

## Coverage

| Behavior | Verification |
| --- | --- |
| Create, join, role ownership, readiness, leave and replacement | Real browser lobby tests and real Socket.IO validation tests |
| Blackout and hidden-tab pause | Both clients reach the same phase; paused opening stays lit until server progression resumes |
| Shared light and reciprocal puzzles | Both complete story paths observe the remote beam and perform both roles' required actions |
| Story branches and puzzle variants | Both endings in Chromium; all four seed/choice combinations in rule tests |
| Radio and keyboard | Contextual transmissions, text Enter acknowledgment, draft/focus retention, literal HTML and hostile-name display, hold/release finale |
| Clipboard | Native system write/read, modern-only copy, denied-access selected-link fallback and friend invite join; in-app browser keyboard copy verified against the full invite |
| Recovery | Refresh, offline/online, 30-second visibility absence, game menu/resume, close/reopen invite with stored credential |
| Network switch with an old connection | Real TCP proxy cuts browser traffic while retaining the old backend socket; automatic reconnect and explicit Resume retry through heartbeat expiry and recover the same player ID |
| Server restart | Isolated server restart loses its room and offers a fresh start instead of trapping a stale screen |
| Responsive interaction | Portrait 390×844 and landscape 844×390; scene taps, scene framing, no horizontal overflow, radio field focus |
| Replay and return | Swapped roles, reset inventory and variant, mismatched votes wait, matching lobby votes finish |

Visibility is explicitly emulated in headless Chromium because independent contexts do not reliably background each other. Clipboard denial and unavailable audio are injected only to verify their fallback behavior. The network-switch test uses real transport interruption, not a mocked socket.

## Practical limits

- Rooms are held in server memory. Refresh and reconnect recover while the server is alive; restarting it discards rooms.
- Reopened invites recover a seat only in the browser profile holding its private credential. Invite links contain no credential. Independent friends need independent browser contexts; another tab using an already connected seat is rejected.
- A hidden or disconnected partner pauses progression. The lobby explains this; the game menu remains available and retains a resumable seat.
- Physical iPhone/Android keyboards, touch scrolling, Safari, public-network latency and first-play duration require human/device playtests. Desktop mobile emulation does not establish them.
- The Codex in-app browser reports programmatic copy success without forwarding it to the system clipboard. The UI therefore says “Copy requested,” keeps the link selected, and explains keyboard/phone copying. Ctrl+C copies the full invite there; one-click system clipboard transfer is not established.
- No solo companion is included in the specified two-player skeleton. No public deployment or service purchase was performed.

Next: redesign one playable screen at a time, beginning with the reciprocal garage-window puzzle. Replace its scene layers with painted illustrations, parallax and refined lighting while retaining verified coordinates and multiplayer rules.
