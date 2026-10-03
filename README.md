# Last Night on Maple Street

A complete two-player browser adventure skeleton, following [GAME_SPEC.md](GAME_SPEC.md). Exactly two friends help each other retrieve their time capsule before one moves away. Each role has different observations; shared light and deliberate partner actions unlock progress.

## Run locally

Requires Node.js 22 or newer and npm. No account, API key, or paid service is required.

```powershell
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite client runs on port 5173 and the authoritative Socket.IO server on port 3001. Keep both processes running; Ctrl+C stops them.

For two independent players on one computer, use a normal browser window and an incognito window (or two different browsers). Duplicating an existing player tab may copy its session credential and is rejected while that seat is connected. Choose **Start a Night** in the first window, then use its invitation link or enter its room code in the other. Choose **Corner House / Alex** and **Blue House / Sam**, then both select **Ready for the Night**.

To try two devices on your local network, open `http://YOUR_COMPUTER_LAN_IP:5173` on each device. The development server binds to all interfaces, and Vite proxies multiplayer requests to the local backend. Your Windows firewall must permit port 5173; both devices must be able to reach the computer. This is a local development setup, not a public deployment.

## Play and recover

Use the scene's large prop targets to interact. Aim with pointer/touch or the labeled beam anchors for keyboard and touch-friendly targeting. The radio offers contextual transmissions and optional short text; voice is never required. Manual hints explain the current cooperative step. Both players act throughout the passage, route, and capsule puzzles. Sam's explicit disclosure choice affects the ending; ordinary radio text does not select a story branch.

Refreshing restores the room and seat using a private browser-stored reconnect credential while the server is running. Leaving the tab or disconnecting pauses important progress until both players return. A display name cannot reclaim another player's seat. Complete the final signal together; the toggle alternative removes any requirement to hold a pointer down. At the ending, both players can agree to replay with swapped roles and a fresh puzzle configuration, or return to the lobby.

## Development and checks

```powershell
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

The transport tests use real Socket.IO clients and an isolated local authoritative server. Browser tests use two independent Chromium browser contexts connected to the same real server, with no multiplayer mocks. Playwright starts the development server if one is not already running. Failed runs retain screenshots and traces in `test-results/`; the HTML report is in `playwright-report/`.

## Architecture and artwork

`shared/` contains protocol types; `server/game.ts` contains authoritative game rules and `server/story.ts` contains authored transmissions; `server/` owns rooms, credentials, validation, revisioned snapshots, puzzle progression, presence, and synchronization; `src/` owns presentation, input, local settings, and realtime transport. The client cannot arbitrarily advance story phases. Role-specific clues are selected for each recipient rather than indiscriminately broadcast.

The temporary scene uses original layered SVG/CSS artwork: background architecture, interactive props, remote/local lighting, silhouettes, foreground, and interface. Interactive scene geometry is independent of final asset filenames, with a manifest reserved for replaceable production assets. Radio captions and visual feedback carry all essential information. Synthesized audio starts only after user interaction and can be muted; reduced motion is respected.

## Limits and next milestone

Rooms live in backend memory. Server restart loses rooms; browser refresh and short disconnections recover only while that server remains running. A production deployment needs a long-lived realtime backend and, if desired, persistent room storage; static hosting alone is insufficient. Local checks cannot establish behavior on real iPhone/Android hardware or across two public networks. Those are release requirements.

This milestone deliberately uses temporary art, animation, and synthesized sound. Next, build one production-quality playable reference scene: the reciprocal garage-window light puzzle. Keep its tested interaction geometry and authoritative rules; replace its layers with painted art, refined silhouettes, atmospheric lighting, gentle foliage motion, and final radio/environmental sound. Validate the scene on physical phones before extending its visual language to the remaining scenes.

For development inspection, `GET /api/dev/rooms/ROOMCODE` reports the phase, variant, presence, and inventory. `POST /api/dev/rooms/ROOMCODE` with a JSON body such as `{"seed":0}` resets that room to the lobby while retaining seats. Seed 0 and seed 1 exercise both authored configurations. These endpoints are disabled when `NODE_ENV=production`. Do not edit backend files during a recovery test: `tsx watch` restarts the server on changes, which intentionally loses in-memory rooms.

Physical-phone keyboard behavior, public-network latency, production persistence, and final artwork/audio are not established by desktop emulation. The browser suite exercises a 30-second real elapsed absence through the document visibility handler; it emulates hidden state because headless browser contexts do not reliably background one another.

Verified locally on October 3, 2026: `npm run build` passed; `npm test` passed all 9 tests; `npm run test:e2e` passed both two-player Chromium paths (seed 0 / early disclosure and seed 1 / late reveal). The browser checks completed both endings and role-swapped replay, observed actual remote lighting, sent contextual radio, recovered Sam's seat after refresh and an offline interruption, and preserved progress during the 30-second visibility absence. The second path tested a 390×844 portrait viewport with focused radio input, literal HTML text, no horizontal overflow, and an essential target in view. No page errors, console errors, or unexpected non-realtime network failures were recorded; socket failures during the deliberate offline interruption were expected.

Browser screenshots are saved under `test-results/story-two-independent-brow-*/`: `shared-light-desktop.png`, `ending-desktop.png`, and `ending-portrait.png`, plus `shared-light-portrait.png` for seed 1. These are verification artifacts, not production game assets.

The final browser rerun passed both paths in 1.1 minutes, including the keyboard hold-and-release finale: releasing Space after the ending transition produces no invalid-action toast. Unit coverage also confirms that Alex can answer a deferred disclosure during the route without duplicating the authored response.


For the built local client, run `npm run build` followed by `npm start`, then open http://localhost:3001. A production-mode smoke check served the built client, created a real room, returned a healthy backend, and confirmed development inspection endpoints were unavailable with `NODE_ENV=production`.

Flashlight aiming sends normalized coordinates at approximately 16 updates per second, with remote interpolation; it does not write persistent storage. Story transitions carry a shared server timestamp and the client estimates its clock offset from snapshots. The local presentation targets approximately 250 ms perceptual alignment; it is not a promise of zero latency or a tested public-network bound. The goodbye requires one second of overlap on the server's 100 ms tick. First-play pacing toward the 10–12 minute design target remains to be measured with human playtesters.
