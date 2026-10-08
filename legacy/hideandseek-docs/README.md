# Last Night on Maple Street

The fresh Railway game. The retired story project at the repository root is not used here.

## Launch locally

In PowerShell:

```powershell
cd 'C:\Users\rapha\Last Night on Maple Street\game'
npm ci
npm run build
$env:PORT = '5174'
npm start
```

Open http://localhost:5174. The same Node process serves the built page and `/live` WebSocket. On a second laptop/phone on the same local network, use this computer's LAN address and port 5174, if the firewall permits it. Deployment requires a separate authorization.

## Play a match

Create a night alone or invite another independent browser/phone with the code. Start works with one person. Alone, you always seek and the game hides the capsule. With friends, the first joiner hides, then the role rotates each round.

Seekers start in a furnished room: walk to the table and use **Pick up**. A solo pickup starts seeking immediately. With a human hider, the street power cuts after ten seconds, followed by 25 seconds to bury beside a mailbox, hedge, porch corner or bin. If the hider misses the deadline, the server buries it. Seekers then reach the street and have two minutes to find it.

Move with WASD/arrows or the left stick. The right action appears only within range. On laptop use **E**, or use the action button. Hold Search for two seconds. A wrong search makes a shared sound and blocks that seeker's searches for five seconds. A human hider can walk to lay footprints but cannot search during seeking and has no flashlight then. After burial, use Disturb at up to three other spots to create decoys. A seeker beam freezes the hider for two seconds, followed by five seconds of immunity. Finding the capsule or running out of time reveals its location to everyone; after five seconds the host can **Start next round**, or it starts automatically after eight seconds. Mid-round arrivals explore preparation and enter play next round. Membership changes begin a fresh, announced scoring cycle at that boundary.

Sound starts on a gesture and can be muted. Back to title leaves. Footprints and disturbed soil appear only in seeker beams. Prints fade over 60 seconds from seeking start or their creation during seeking. At 30, 60 and 90 seconds, the hider chooses a true radio clue; an unanswered choice sends automatically after five seconds. Solo rounds generate both trails, three decoys and automatic clues. A solo match lasts three rounds, two players play four alternating-hider rounds, and three to six players each have one turn hiding. When found, every seeker earns the remaining whole seconds and the hider earns elapsed whole seconds. On timeout the hider earns 120 and seekers earn zero. The final scoreboard offers **Play again** to every player, and remembers the lone player's best match on their device. Use **Radio** above the action button, or **R** on laptop. Four quick phrases follow your role and phase; type up to 80 Unicode characters and press Send or Enter. Messages and scheduled clues appear as named transmissions and remain in the latest 24-entry history, which restores on refresh and resets with a new match. The server allows three messages per seat per five seconds. Escape or Close dismisses the panel without erasing an unsent draft. Typing does not move or trigger E/R; click the world or blur the field before using keyboard movement. The page stays fixed; recent history scrolls inside its panel.

All sound follows Sound on/off: crickets, power hum/click, local footsteps, rummaging, wrong searches, freezing, discovery, round cues and the closing motif. Refresh needs one tap to unlock audio; a previously unlocked page resumes after being shown again. Full checks and limitations are in STEP7_VERIFICATION.md. Repeat the ten-minute connection/control/round-transition check against port 5174 with `node tests/step2-soak.mjs`, and the six-player rendering check with `node tests/step5-render-budget.mjs` (full trace-cap renderer stress). The historical Step 5 soak script predates final match screens; the current browser suite covers complete matches and replay.

Refresh to return to the same seat. Two tabs can be different players. Close one tab, open its invite in a new tab in the same browser, and use Return as name to reclaim its disconnected seat using the private browser credential. The same name in a different browser cannot recover that seat. Explicit leave removes the recovery credential. A restart discards all rooms; returning browsers receive an ended-night message and a working title screen.

```powershell
npm run assets
npm test
npm run test:e2e
```

The asset command reads the five supplied packs outside `game/`; the build needs only selected exports committed under `public/assets`. Production starts compiled JavaScript, with no development tools or debug endpoints. The selected CC0 assets and self-hosted fonts include their licences.

Deployment settings and safe stop-first updates are in [DEPLOY.md](DEPLOY.md). During play, supported browsers offer Fullscreen; other browsers show a dismissible Add to Home Screen tip. Round role cards fade automatically. The phone radio is docked above the world, with sideways-scrolling phrases and recent messages.

The finishing checks and real-device limitations are recorded in [FINISHING_VERIFICATION.md](FINISHING_VERIFICATION.md).
