# Last Night on Maple Street: build plan

October 3, 2026. Approved with the user's amendments. Steps 1 through 7 are independently verified. The requested finishing pass is authorized.

The new brief replaces GAME_SPEC.md. The retired game is preserved in commit `c3da94123cc2f3113f85d8e2cf94ca7f3afaa501`. AGENTS.md records the standing rules and the approved amendments below. The fresh game lives in `game/`.

## 1. Fresh project and one Railway server

Build a fresh TypeScript game under `game/`: Vite builds the client, Three.js renders real 3D, and one always-on Node process on Railway serves the built page, assets and WebSocket connection from the same public address. Reuse concepts from the retired game, not its screens or server. No Redis, database, external room store, scheduled connection replacement, cluster workers or second instance. Each room has a short code and six seats. Each device receives a random private seat credential, stored per tab so two tabs can play independently; a refresh restores that tab's seat. Room codes grant admission, not control over another seat.

All rooms live in that process's memory. Each device moves its own character and reports position and facing. The server validates speed and boundaries and rejects impossible reports; it does not simulate human movement, predict it or reconcile corrections. The server owns gameplay actions and round deadlines. Versioned room snapshots and unique action IDs make duplicate requests safe. No distributed coordination is needed.

Each device keeps one live WebSocket. Heartbeats detect dead connections; a network switch, refresh or unlock reconnects with backoff and the same private credential. Seats are reserved for ten minutes after disconnect, without pausing the round. Keep the per-tab seat, plus a browser-local private credential list. A new tab entering the same room may be offered one of that browser's disconnected seats, confirmed by the server; connected seats cannot be claimed this way. A name never authenticates a seat. Resume with a current snapshot, not stale movement. A missing hider is handled by the game, never by computer-controlled seekers.

Every process start gets a new random server identity. A restart or redeploy deliberately loses all rooms. On reconnect, an old identity or missing room clears the obsolete seat and returns the player to the title with a friendly message: "The night ended when the server restarted. Create a new night to play again." An expired room gets its own ended-night message. While the server is unreachable, show reconnection status and a working Back to title control, rather than a dead screen. Never silently create a replacement room or pretend the old match survived.

Initial hard caps: **25 rooms, six seats per room**, counting disconnected reservations toward the seat cap. Reject excess creation/join requests with a readable message. Remove rooms ten minutes after the last connected device leaves, expire seat reservations, and bound footprint collections, radio history, replay paths and pending messages. Sweep regularly and release timers/sockets when deleting a room. Apply per-connection/IP rate limits, message-size limits and slow-client backpressure. Load-test the full cap before release; lower it if needed.

Production runs compiled JavaScript through `npm start`, binds to `0.0.0.0` using Railway's `PORT`, and exposes only the game and live protocol. No Vite development server, `tsx`, watch mode, inspector, test controls or debugging endpoints on the public site. On shutdown, notify sockets if possible and close promptly; the restart handshake still handles an abrupt crash.

## 2. Authority, secrets and movement

Devices move locally with local collisions, report their position and facing, and interpolate other players. The server checks speed and boundaries and rejects impossible moves. No server-side human movement simulation, prediction or correction system. The server still validates action range, two-second searches, burial, timers, truthful clues, round transitions and scores. A wrong search starts a five-second cooldown for that seeker. Hider freeze remains a gameplay action validated separately; it does not filter clue data sent to seekers.

Capsule location and the computer hider's route use private server randomness, independent of the public layout seed. Seekers receive no capsule object, hidden spot ID, secret seed, true/false trail labels, or private hiding-phase hider positions. Human hiders can receive their own burial confirmation. Only after a successful server-validated search or round end does the capsule enter seeker messages. Clues deliberately narrow the possibilities; that is part of play, not a network leak.

Send seekers all footprints and disturbed-spot marks without real/false trail labels. Each device renders them only inside flashlight beams, including shared beams. No server-side beam or wall checks to filter these marks. The private capsule location remains absent from seeker payloads until discovery or reveal. This deliberately allows a modified client to inspect clue marks before lighting them; capsule coordinates remain secret. Search IDs prevent duplicate scores after reconnects.

Report position and flashlight facing at **20 Hz while moving**, with low-frequency heartbeats when idle. Broadcast accepted snapshots at **10 Hz**. Interpolate remote players with a 100 ms buffer and no more than 100 ms extrapolation, then stop. Local movement is direct, not server prediction. Aim for remote movement visible within 250 ms on ordinary connections and measure it.

Hidden tabs send an immediate stop when possible; stale movement expires after 300 ms. Locking one phone never pauses the room. Returning players get a current snapshot. A departed hider triggers a valid automatic burial if necessary, and automatic truthful clues thereafter. Other humans keep seeking; never create computer-controlled seekers.

## 3. One person through six

Use one title, one room lobby, one Start button, one round state machine and one scoreboard. Start works with one connected player. The server chooses the capsule spot, lays a believable burial trail plus one false trail, moves the shadow hider, and emits a true clue at 30, 60 and 90 seconds. The lone human always seeks. Their round score depends on time remaining when found, with zero for a timeout.

Approved match lengths: three rounds with one person; four rounds with two people, alternating hiders; one hider turn each with three to six. The normal inter-round reveal is the admission boundary. A friend joining during a round can explore the preparation room and radio; they enter the street next round. When a lone player gains a friend, the next round selects a human hider. A roster change starts a fresh scoring cycle after the reveal, clearly announced, so newcomers do not compete against accumulated points. No separate practice mode or bot seekers.

Approved scoring: the hider earns elapsed seek seconds; each seeker earns remaining seconds on a find, zero on timeout. This is the same rule for the lone seeker. All participants get the same number of hider turns within a stable roster. On a timeout the hider earns the full 120 seconds and seekers earn zero. The server computes whole elapsed seconds rounded down and remaining seconds as 120 minus elapsed. Balance can still be revised after playtests. Human hiders choose among server-generated true clues; if they miss a deadline, the server sends one automatically so they cannot stall the game.

## 4. Street and presentation

Build **one approximately 80 by 36 metre street and one small shared preparation room**. Start with six houses, a six-metre road, sidewalks and front gardens. Walking speed starts at four metres per second. Use **24 hiding spots**, four per house, with recognizable mailboxes, hedges, porch corners and bins. A spot is usable only within roughly 1.3 metres.

The initial layout is the straight street. Only after a full match works, after step 6, add staggered gardens and a short cul-de-sac. All layouts use reachable authored hiding sockets and consistent collisions. The public layout seed never determines the secret capsule spot.

Deep blue moonlight provides silhouettes after every electric light switches off. Flashlights are real spotlights illuminating 3D surfaces, with warm beams and consistent wall occlusion. Mood images are references for art direction, not promises of expensive post-processing. Keep the title to the game name, Create a night and Join with code. No development labels, promotional paragraphs or em dashes. In play: time, essential status, left stick, contextual right action, always-available radio. Text is at least 16 CSS pixels and touch targets at least 44 pixels, with safe-area padding.

**Approved look: [Mood A, cinematic miniature diorama](design/mood/A-diorama.png).** Match its raised three-quarter camera and composition: houses along the top, sidewalk and road below, dark foliage framing the edges, deep blue night and warm cone-shaped beams. Add selected roof/porch trim, layered tree and hedge silhouettes, restrained roughness and baked contact shading. Use real spotlights plus economical translucent beam volumes. Avoid dense grass, cinematic depth-of-field and expensive fog. The kit houses remain simpler; richer silhouettes and lighting should do more than added polygon density.

Replace blocky characters with natural-proportioned stylized figures, with a target of 3,000 to 5,000 triangles each after optimization, shared materials and modest animation rigs. Recommendations and exact free archive names are recorded below; do not use replacement characters until you supply them. At the end of step 2, show a real game screenshot next to Mood A and state where geometry, characters, shadows, foliage and lighting fall short.

## 5. Exact asset downloads

The supplied five **free individual ZIPs** belong under `assets/source/kenney/`, extracted into the destinations below with original filenames/folders and `License.txt`. Never rename mismatched source files; report discrepancies. All five packs are CC0. No replacement character file is used before you download it.

| Official pack | ZIP filename | Extracted destination under `assets/source/kenney/` |
| --- | --- | --- |
| [City Kit Suburban 2.0](https://kenney.nl/assets/city-kit-suburban) | `kenney_city-kit-suburban_20.zip` | `city-kit-suburban/` |
| [Furniture Kit](https://kenney.nl/assets/furniture-kit) | `kenney_furniture-kit.zip` | `furniture-kit/` |
| [Car Kit](https://kenney.nl/assets/car-kit) | `kenney_car-kit.zip` | `car-kit/` |
| [Blocky Characters 2.0](https://kenney.nl/assets/blocky-characters) | `kenney_blocky-characters_20.zip` | `blocky-characters/` |
| [City Kit Roads 2.1](https://kenney.nl/assets/city-kit-roads) | `kenney_city-kit-roads.zip` | `city-kit-roads/` |

The initial selected files are:

- **Suburban, `Models/GLB format/`:** `building-type-a.glb` through `building-type-f.glb`, `driveway-short.glb`, `fence.glb`, `fence-low.glb`, `path-short.glb`, `path-stones-short.glb`, `planter.glb`, `tree-small.glb`, `tree-large.glb`, and `Textures/colormap.png`.
- **Furniture, `Models/GLTF format/`:** `bedSingle.glb`, `cabinetBedDrawerTable.glb`, `books.glb`, `radio.glb`, `rugRectangle.glb`, `trashcan.glb`, `cardboardBoxClosed.glb`, `wall.glb`, `wallCorner.glb`, `wallDoorway.glb`, `wallWindow.glb`, `floorFull.glb`. This pack really uses a GLTF-named folder for its GLB files. Retain any accompanying textures.
- **Cars, `Models/GLB format/`:** `sedan.glb`, `van.glb`, `box.glb`, `wheel-default.glb`, and `Textures/colormap.png`.
- **Characters, `Models/GLB format/`:** `character-a.glb` through `character-f.glb` and their matching `Textures/texture-a.png` through `Textures/texture-f.png`. Validate available animation clips during intake.
- **Roads, `Models/GLB format/`:** `road-straight.glb`, `road-end.glb`, `road-bend.glb`, `road-driveway-single.glb`, `light-curved.glb`, `dumpster.glb`, `electricity-pole.glb`, and `Textures/colormap.png`.

The packs do not supply every exact gameplay prop. Author matching small mailbox, flashlight, walkie-talkie and capsule meshes, plus footprint decals, during the approved art slice. Hedge clusters can reuse the supplied vegetation. Keep source assets separate from the selected, optimized runtime exports in `game/public/assets/`. A manifest records source file, scale, licence, collisions and animation mapping. Never ship entire source archives.

**Replacement character downloads, awaiting your supply:** the free [Quaternius Universal Base Characters](https://quaternius.itch.io/universal-base-characters) file `Universal Base Characters[Standard].zip`, extracted under `assets/source/quaternius/universal-base-characters/`, and the free [Universal Animation Library](https://quaternius.itch.io/universal-animation-library) file `Universal Animation Library[Standard].zip`, extracted under `assets/source/quaternius/universal-animation-library/`. Preserve all internal names. Their archive names and CC0 licences are verified; internal model names will be checked on arrival. The bases average about 13,000 triangles and need casual clothing/hair, retargeting and reduction to the runtime budget. They are not ready-made finished neighbourhood characters. No replacement model is imported in step 1. See `game/ASSET_INTAKE.md` for the verified current selection and Mood A adaptation details.

The local intake command is `npm run assets` from `game/`. Production builds use committed selected exports and do not require the source archives, which are outside Railway's `/game` root.

## 6. Mid-range Android budget

Target stable **30 fps on a mid-range Android phone**, 60 where available. Initial budgets: roughly 100,000 visible triangles, fewer than 100 draw calls, and no more than about 15 MB of compressed initial game assets. Instance repeated trees/fences, merge static geometry, share palette materials, pool footprints, and cull beyond the camera. Avoid allocations in the frame loop.

Cap pixel ratio around 1.25 and reduce render resolution if sustained frame times exceed 33 ms. Use real flashlight lights for all active seekers, but reserve dynamic shadow maps for the nearest one or two lights, with simplified static occlusion for others. Test wall leaks explicitly. No mandatory bloom, ambient-occlusion pass or depth-of-field. Limit texture sizes and preload only the selected layout. Validate frame time, heat and memory after ten minutes on a real phone; desktop emulation alone is insufficient.

### Shared ground-first flashlight dimensions

Every device and every player uses `FLASHLIGHT_PROFILE` in `game/shared/street-layout.ts`. A real spotlight originates 1.10 m above the player, 0.40 m ahead, and aims 2.80 m horizontally ahead of that origin at y = -0.45 m. Downward pitch is atan(1.55 / 2.80) = 0.505581 radians (28.97 degrees); outer half-angle is 0.375 radians (21.49 degrees), full cone angle 42.97 degrees. Penumbra is 0.18, colour #FFD08A, intensity 3.8, distance cutoff 14 m, distance decay 0. The distance cutoff is not its ground reach: the downward cone determines that footprint.

On a flat y = 0 ground plane the soft-edged elliptical footprint starts **1.308 m** ahead of the player, ends **8.776 m** ahead, and has maximum width **2.543 m**. Existing road top y = -0.055 gives **1.354–9.195 m**, maximum width **2.670 m**. Sidewalk top y = 0.02 gives **1.292–8.624 m**, width **2.497 m**. Lower grass top y = -0.175 gives **1.453–10.108 m**, width **2.948 m**. These are outer fade boundaries; occluding objects interrupt illumination. The same physical cone intersects raised ground differently, identically on all devices. Future ground marks must use these same world-space cone and penumbra parameters, never a screen-size-dependent reveal radius.

Ground materials compensate for grazing spotlight incidence inside the existing light/shadow calculation, so road, grass and paving remain clearly readable. Walls retain ordinary diffuse response. No translucent wedge or ground overlay is used. The same two character slots cast shadows on every device, with no added shadow lights. The raised camera smoothly follows the footprint centre in the player's facing direction and widens immediately during turns to preserve its full outline. At 667x375 settled characters remain about 49 pixels tall; full beam visibility takes priority.

## 7. Build order and two-phone checkpoints

Each row is a separate approval-sized implementation request. The first playable slice gets the chosen final visual direction; later steps add mechanics rather than replacing the presentation.

| Step | Deliverable | Test before proceeding |
| --- | --- | --- |
| 1 | Fresh project, assets, title and real in-memory rooms | Create alone, Start enabled, second phone joins by code, leave/back/copy all work |
| 2 | Mood A street only, thumb/keyboard controls, synchronized lights-out, sound and reconnects; Railway-ready production build | Two independent sessions walk and turn; 667x375 fits; ten-minute soak and measured FPS; actual-versus-Mood-A screenshot. No deployment in this request. |
| 3 | Single-server simulation and recovery hardened | Refresh, hidden tab, locked phone, network switch and ten-minute session; restart returns both phones to title with a clear message |
| 4 | Hiding, preparation room, search and reveal | Complete both a one-person round and a human-hider round; inspect seeker network payloads for secrets |
| 5 | Beam-only trails, decoys, shadow freeze and timed true clues | Both phones agree on beam-only trails, decoys and freezes; three true clues; disconnected hider cannot stall |
| 6 | Scores, rotation, roster boundaries and Play Again | Full two-person match; join a solo room between rounds and get a human hider next round; only then add the other two layouts |
| 7 | Contextual/typed radio and finishing audio | Messages reconnect safely, are rate-limited and readable; muted play remains understandable |
| 8 | Four-to-six-person playtests and release checks | Fairness, performance, real Android/iPhone, different networks, room/seat caps, abandoned-room cleanup and match replay |

Local tests come first. Public phone testing happens only after you authorize the first deployment. Automated coverage includes round transitions, duplicate actions, reconnect snapshots, restart/expired-room responses, capacity and cleanup, true-clue validation and secret filtering. Two independent browser contexts exercise complete matches. Verify the production build/start separately and confirm debugging routes do not exist. Every stage reports actual checks and gaps; no finished claim based on a landing page.

## 8. What you set up on Railway

These settings must be ready for your first Railway deployment **at the end of step 2**. Step 1 runs locally only; no deployment or purchase now.

1. Sign into Railway and connect GitHub. Create an empty project, then **one empty service**, and connect `OfficialEseosa/last-night-on-maple-street` to that service. Configure it before applying staged changes. Do not import/deploy the retired root application or accept automatically generated extra services. Do not add Redis, a database or a volume.
2. In service Settings, set the source branch to the approved commit's branch, **Root Directory `/game`**, **Build Command `npm run build`**, and **Start Command `npm start`**. Railway installs dependencies from the lockfile; the build compiles both server and browser assets. The new project's package configuration will pin a supported Node LTS version. Set **Healthcheck Path `/`**, which checks the production page without adding a diagnostic endpoint. [Root directory settings](https://docs.railway.com/deployments/monorepo), [healthchecks](https://docs.railway.com/deployments/healthchecks).
3. In Variables enter **`NODE_ENV=production`**, **`MAX_ROOMS=25`**, **`MAX_PLAYERS_PER_ROOM=6`**, **`ROOM_IDLE_TTL_SECONDS=600`**, and **`SEAT_RECONNECT_TTL_SECONDS=600`**. Let Railway inject `PORT`; do not hard-code the local port. Private seat tokens are generated in memory; no database URL or persistent token secret is required. These settings are implemented in step 1. Room and player caps cannot exceed 25 and 6.
4. Under Deploy/Scale, select **one region near your testers and exactly one replica total**. Keep **Serverless/App Sleeping OFF**, no autoscaling or cron schedule, and no PM2/Node cluster workers. Use **Restart Policy On Failure, maximum 10 retries**. Do not enable PR/preview environments that launch another game server. [Serverless setting](https://docs.railway.com/deployments/serverless).
5. Disable GitHub automatic deployments. Set **Deployment Overlap 0 seconds** and **Draining 0 seconds** (`RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0`, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=0`). Zero overlap alone does not prove there is never a second booting process. For every subsequent deployment, check that no matches are running, then **Remove the active deployment and confirm it has stopped before manually choosing Deploy Latest Commit**. Accept the brief downtime and loss of rooms. Freeze deployments during judging. This stop-first procedure enforces the strict one-instance requirement rather than a rolling replacement. [Disable autodeploy](https://docs.railway.com/deployments/github-autodeploys), [deployment teardown](https://docs.railway.com/deployments/deployment-teardown), [remove/deploy actions](https://docs.railway.com/deployments/deployment-actions).
6. When you authorize the first deployment, apply the settings and deploy that single service. In Settings > Networking > Public Networking, click **Generate Domain**. Its target port must be the port the app reads from Railway's `PORT`; use auto-detection for the single listener. One HTTPS address serves both the page and the `wss://` connection. No separate frontend host, TCP proxy or WebSocket service. [Domain setup](https://docs.railway.com/networking/domains/working-with-domains).
7. Open that HTTPS address on two phones on different networks. Join one code, start, refresh, lock/unlock a phone, switch networks and play for ten minutes. With no other matches running, intentionally restart the service: both phones must return to the title with the ended-night message, then create a new room successfully. During an outage, reconnect status and Back to title must remain usable.
8. Inspect Railway logs, CPU/RAM and usage, then run the room-cap/cleanup load test. Trial credit is finite; an always-on process is not guaranteed to fit a free allowance. Do not upgrade or enter paid billing until you approve a measured budget. The revised brief reports that you confirmed outside hosting is allowed; retain that confirmation and check any Railway-specific restrictions before submission. [Trial limits](https://docs.railway.com/pricing/free-trial).

## 9. Brief issues to resolve

- The later suggestion of a separate solo practice night conflicts with the required unified room flow. One person must work from the first playable round, not as a later separate mode.
- Capsule secrecy must refer to seekers. A human hider necessarily knows the spot they selected. Truthful clues and remembered footprints can also let a seeker infer it; the enforceable rule is no secret network disclosure and server-validated discovery.
- Hider survival points and fast-find seeker points now use the approved values and roster-change rules above; balance remains unproven.
- Start wrong-search cooldown at five seconds for the individual seeker. Tune spot count and cooldown with larger groups. The approved match lengths and scores still need larger-group balance playtests.
- Footprints created early in a 25-second hiding phase could fade before seeking starts. Begin the initial burial trail's fade clock at the seek phase, then age new false trails normally.
- A six-person match is roughly 16 to 18 minutes if every round reaches the limit, including preparation and reveals. It is not necessarily a quick session.
- Quiet recovery is achievable; completely imperceptible recovery under every network failure is not. Do not pause everyone, invent movement indefinitely or conceal genuine loss of connection.
- Fullscreen and orientation locking differ by mobile browser. Fill the available viewport, feature-detect native fullscreen, and give a minimal landscape/home-screen hint only when needed. Never block play on installation.
- The plan's real lights and strong darkness need phone tests: several dynamic shadow maps, fog and cinematic effects can overwhelm a mid-range GPU. The images cannot substitute for performance measurements.
- A single in-memory server intentionally loses every night on a restart and cannot scale to multiple replicas. Rolling deployments can momentarily run two processes, so the setup uses manual stop-first deployments. This accepts downtime and does not promise zero room loss.
- The revised brief reports outside hosting is allowed but assumes that includes Railway; I have not independently reviewed the signed-in challenge rules. Retain your confirmation. Trial credit also does not establish a free always-on launch budget.

## Current scope

Steps 1 through 7 are independently verified. The finishing pass docks the phone radio, adds optional fullscreen and home-screen/orientation hints, brief role teaching and first-action attention, and verifies Railway production commands. No deployment, voice chat, new art, scoring changes or additional layouts.

Footprints are placed approximately every 0.45 metres and fade linearly over **60 seconds**. The hiding trail starts its fade clock when seeking begins; prints made while seeking start immediately. Store at most **256 footprints**, **four disturbed marks**, three sent clues and one three-option clue offer per room; expired footprints are removed. The cap retains roughly 115 metres of recent walking and may remove the oldest prints before their full lifetime during sustained movement. Disturbed marks remain until reveal. All marks have random public identifiers and a common timestamp. Every public projection uses a fresh cryptographic Fisher-Yates shuffle of marks and footprints, including after a decoy is added during seeking. Stable identifiers preserve rendering identity; list indices carry no creation order or burial-versus-decoy information. Solo route generation also randomizes which trail is built first; all its footprints share the seeking-start fade clock. Seekers receive no capsule spot, true/false trail flag, mark spot identifier or clue candidate list before reveal.

Every client clips footprint and disturbed-ground fragments against the shared physical flashlight cone above, using the same accepted seeker poses and server time. Moonlight never reveals them. This is a geometric beam reveal without extra server beam/wall visibility filtering. The server checks a human hider against the shared cone at their ground position, freezes translation for **2 seconds**, then grants **5 seconds** of immunity after the freeze. Turning remains available while frozen. Human hiders have no flashlight during seeking and never receive a Search action.

At **30, 60 and 90 seconds** of seeking, a connected human hider gets three true options and **5 seconds** to choose; otherwise the server sends one. A disconnected hider or the computer hider sends immediately at the scheduled time. Every possible offered combination retains at least two possible hiding spots, including the capsule, so clues alone do not disclose it. Solo burial and one false trail follow collision-valid routes, with three decoy marks. Radio transmissions remain visible for 15 seconds with a short crackle; their bounded history survives refresh. Scheduled clues also appear, visibly marked as clues, in the bounded shared radio history.

Matches last three rounds with one person, four alternating-hider rounds with two, and one hider turn per player with three to six. Each seeker earns remaining whole seconds on a find; the hider earns elapsed whole seconds. Timeout awards the hider the full seeking duration and seekers zero. Scores and completion are server-owned and awarded once per reveal. After a reveal, an eight-second countdown advances automatically; the host may advance after the five-second capsule reveal. The last reveal shows the final scoreboard instead. Any seated player may choose Play again, with the same group, or leave for the title.

A membership change is applied at the next round boundary and starts a fresh scoring cycle with an announcement. Mid-round arrivals explore the preparation room until then. Explicit departures and expired reservations change membership; a temporary disconnection preserves the seat and scores. Hider selection skips currently disconnected seats, so they cannot stall the round. The device stores only a solo best-match total after an authoritative final result, never awards points. Refresh/resume restores server match identity, scores and phase.

The radio is available throughout play, including preparation, reveal and final scores. R opens it on laptop; the phone button sits above the action button. Four public-role/phase phrases accompany a plain-text box and recent history. The server accepts at most 80 Unicode characters and three messages per seat per five seconds, independently of movement and gameplay request budgets. A compact event carries only the public sender, text, kind, identifier and timestamp. Keep 24 messages per match, including scheduled clues; refresh restores them, while replay or a roster-change fresh cycle resets history. Incoming messages update existing rows without replacing the focused input or draft.

Procedural finishing sound adds soft local footsteps, search rummaging, discovery, freeze, round start/end and a final motif. All pass through the same mute/visibility gain; crickets continue throughout play. A first gesture unlocks audio after refresh; a previously unlocked context resumes after a hidden page returns. Gameplay information remains visible without sound.

Step 7 results are recorded in game/STEP7_VERIFICATION.md. Record this finishing pass in game/FINISHING_VERIFICATION.md, save phone dock/role evidence in design, write game/DEPLOY.md, commit and stop. No additional gameplay features.
