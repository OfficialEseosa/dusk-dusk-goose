# Project instructions

PROJECT: Dusk Dusk Goose. A fast infection-tag party game in the dark for 1 to 6
players on their own phones or laptops, for the Handshake x OpenAI "Create a
Multiplayer Game" challenge (entries close October 30, 2026). Hosted on Railway.

WHAT IT IS: Everyone starts as a kid with a flashlight. A goose hunts in the dark.
A kid who is touched becomes a goose and keeps playing. A flashlight beam freezes
a goose briefly; batteries are small. Kids still standing at dawn win. Alone, the
player survives as long as they can against a growing flock of computer geese.

The full design is in research/00-START-HERE.md. That file wins over the other
research files. The research folder is deliberately not in git: read it, never
add it to git, never edit it.

QUALITY BAR: A finished, shipped game that looks and feels like a small commercial
mobile game. Fun and looks are requirements. A feature that works but feels flat
is not done.

ALWAYS TRUE:
- Tapping Play puts the player in the action within seconds. Nobody ever waits on
  a screen with nothing to do.
- Players join with a room code. No login, no install. 1 to 6 players. The same
  room and flow work with one person; computer players fill empty seats.
- Two controls: a move stick on the left and one action button on the right.
  Laptop: keyboard to move and one key for the action.
- Devices move their own characters and report positions. The server validates
  movement and decides every catch, freeze, pickup, timer and score. Computer
  players are simulated on the server.
- One always-on Node server, exactly one instance, owns every room in memory. No
  database. The same server serves the page and the WebSocket from one address.
- A dropped connection reconnects by itself and the player keeps their seat. A
  valid private credential takes its seat over immediately. A name alone never
  recovers a seat. A server restart sends players to the title with a friendly
  message.
- One player's hidden tab, locked phone or slow connection never freezes anyone
  else. If someone leaves, the game carries on.
- Real 3D. The scene is readable and colourful at night; darkness hides the
  geese, not the game. Characters are large and expressive.
- Every event a player causes or suffers has a visible and audible response.
- Landscape. The game fills the screen. The page never scrolls or zooms. Text at
  least 16 pixels and touch targets at least 44 pixels on a small phone.
- On-screen controls are created once and updated, never rebuilt when messages
  arrive.
- Sound starts on the first tap. Nothing essential depends on sound, colour alone
  or vibration.
- Production runs compiled JavaScript, reads its port from the host, and exposes
  no development or debugging endpoints.
- The words prototype, graybox, placeholder and temporary never appear on screen.
- Use only assets already in the repository folder. If something is missing,
  build it from simple shapes in the same style, note it in PLAN.md, and continue.

DONE MEANS: you ran it and looked at it. Open the game at a small landscape phone
size (667 by 375) and at laptop size, with at least two separate browser sessions
where multiplayer is involved. Save screenshots. Judge them as a stranger would.
Record in PLAN.md exactly what you checked, the commands you ran and their
results, and what you could not check. Never claim a check passed unless it ran.

HOW WE WORK: PLAN.md at the repository root is the living plan: progress
checklist, decision log, surprises, and results. Keep it current. Commit and push
after each phase. Work through the phases without asking for approval between
them. Stop and ask only before something irreversible outside this repository
(deploying, purchasing, deleting remote data). If something is not possible, say
so in PLAN.md, choose the nearest workable option, and carry on. Do not deploy.

ON THIS MACHINE: Windows 11, PowerShell, Node 22. Browser tests need Chromium
started with --use-angle=d3d11 or 3D renders in software at a few frames a
second. The repository is OfficialEseosa/dusk-dusk-goose, branch main.
