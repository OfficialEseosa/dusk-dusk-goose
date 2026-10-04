# Project instructions

Source: section 6 of audits/GAME-BRIEF-OPTION2-2026-10-03.md, amended by the user's October 3 Railway hosting instruction. The direction change supersedes GAME_SPEC.md, which is retired. The old story game and its server are preserved in Git, not the base for the replacement.

The introductory player count is normalized to 1 to 6. Capsule secrecy applies to seekers; a human hider necessarily knows the spot they selected. Hosting rules incorporate the user's Railway override. Other gameplay and quality rules are retained.

PROJECT: Last Night on Maple Street. A replayable hide-and-seek party game in the
dark for 1 to 6 players on their own phones or laptops, for the Handshake x OpenAI
"Create a Multiplayer Game" challenge. Hosted on Railway.

WHAT IT IS: The last night of summer, 2002. The power is out on Maple Street. Each
round, one player secretly buries a time capsule somewhere on the dark street. The
others have about two minutes to find it using flashlights and walkie-talkies.
Footprints and disturbed hiding spots can only be seen inside a flashlight beam.
The hider stays in play as a shadowy figure laying false trails and must radio one
true clue every 30 seconds. Roles rotate. Highest score wins.

QUALITY BAR: A finished, shipped game that looks and feels like a small commercial
mobile game. Not a prototype.

ALWAYS TRUE:
- Players join with a room code. No login, no install. 1 to 6 players.
- There is no separate single-player mode. The same room and the same flow work
  with one person: they can start a night alone, and the game itself plays the
  hider every round (buries the capsule, lays the trails, radios true clues). A
  lone player always seeks. If a friend joins between rounds, the next round has
  a human hider.
- Devices move their own characters and report positions/facing. The server
  validates speed and boundaries, without server movement simulation, prediction
  or correction. It decides searches, burial, ranges, timers, clues and scores.
  A seeker's device never learns where the capsule is
  until it is found or the round ends.
- One always-on Node server, exactly one instance, owns every room in memory.
  No external store or database. The same server serves the game page and the
  live WebSocket connection from one public address.
- Each device keeps one live WebSocket and reconnects automatically after a
  connection loss, keeping its seat while that room still exists.
- A server restart or redeploy loses all rooms. Return affected players to the
  title with a clear, friendly message; never leave them on a dead screen.
- Production starts compiled JavaScript without development-only tools, reads
  its port from the host, and exposes no development or debugging endpoints.
- Clean up abandoned rooms and expired seats; cap room count and seats per room,
  and bound stored histories so memory cannot grow indefinitely.
- Never enable extra replicas, cluster workers, sleeping, or overlapping active
  game servers. Use stop-first deployment when necessary to preserve one instance.
- Do not deploy while matches are in progress. Freeze deployments during judging.
- Real 3D, low-poly, built from the asset kits I supply. Properly dark after the
  power cut. Flashlights are real lights.
- Landscape. The game fills the screen. The page never scrolls or zooms.
- Phone: move stick on the left; on the right an action button that appears only
  near something usable, and a radio button that is always available.
- Laptop: keyboard to move, one key to act, one for the radio.
- Text at least 16 pixels on a small phone. Touch targets at least 44 pixels.
- One player's hidden tab, locked phone, or slow connection never freezes anyone
  else. If someone leaves, the game carries on without them.
- Nobody ever looks at a waiting screen with nothing to do.
- Sound starts on the first tap. Nothing essential depends on sound, colour alone,
  or vibration.
- The words prototype, graybox, placeholder and temporary never appear on screen.

DONE MEANS: before you tell me something is finished, open the game yourself at a
small landscape phone size and at laptop size, with at least two separate browser
sessions in the same room, and look at it. Confirm nothing is cut off, nothing
scrolls, every control is reachable with thumbs, and both sessions agree on what
is happening. Tell me exactly what you checked and what you could not check.

HOW WE WORK: one change per request. Before changing anything, tell me your plan
in two or three sentences. If something I ask for is not possible, say so plainly
and offer the nearest thing that is. Do not add features I did not ask for.

APPROVED AMENDMENTS:
- Mood A is approved. Use its raised camera, houses above sidewalk/road, dark
  foliage framing, deep blue moonlight and warm cone-shaped beams. Compare a real
  screenshot against Mood A and report shortcomings at the end of step 2.
- Send footprints/disturbed marks to seekers without false-trail labels. Each
  device shows them only inside beams. No server beam/wall visibility filtering.
- Keep per-tab seats. Offer a disconnected same-browser seat in a new tab using
  its private credential; never recover by name. A valid private credential
  takes over a stale/live seat immediately; the displaced tab clears auto-resume.
- One street and one shared preparation room first. Other layouts after step 6.
- Start burial trail fading at seeking. Wrong search cooldown starts at 5 seconds.
- Replacement character downloads must be listed before use. Wait for the user
  to supply them, preserve source filenames and report mismatches.

CURRENT AUTHORIZATION: Step 6 is independently verified. Build step 7 only:
persistent contextual quick phrases and up-to-80-character plain-text radio,
server rate limits and bounded match history including scheduled clues,
input isolation and phone keyboard resilience, and finishing sound respecting
mute/visibility/gesture recovery. Preserve all earlier flow, privacy, movement,
scores and persistent controls. Run server tests ten consecutive times and all
browser tests, write STEP7_VERIFICATION.md, save phone radio evidence, commit and
stop. No deployment, voice chat, layouts, new art, scoring changes or step 8.
