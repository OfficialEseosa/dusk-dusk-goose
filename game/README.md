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

## Play a round

Create a night alone or invite another independent browser/phone with the code. Start works with one person. Alone, you always seek and the game hides the capsule. With friends, the first joiner hides, then the role rotates each round.

Seekers start in a furnished room: walk to the table and use **Pick up**. A solo pickup starts seeking immediately. With a human hider, the street power cuts after ten seconds, followed by 25 seconds to bury beside a mailbox, hedge, porch corner or bin. If the hider misses the deadline, the server buries it. Seekers then reach the street and have two minutes to find it.

Move with WASD/arrows or the left stick. The right action appears only within range. On laptop use **E**, or use the action button. Hold Search for two seconds. A wrong search makes a shared sound and blocks that seeker's searches for five seconds. A human hider can walk but cannot search during seeking and has no flashlight then. Finding the capsule or running out of time reveals its location to everyone; after five seconds the host can **Start next round**. Mid-round arrivals explore preparation and enter play next round.

Sound starts on a gesture and can be muted. Back to title leaves. Footprints, radio, clues and scores are not included in this step. Full checks and limitations are in STEP4_VERIFICATION.md. Repeat the ten-minute connection/control/round-transition check against port 5174 with `node tests/step2-soak.mjs`, and the six-player rendering check with `node tests/street-render-budget.mjs`.

Refresh to return to the same seat. Two tabs can be different players. Close one tab, open its invite in a new tab in the same browser, and use Return as name to reclaim its disconnected seat using the private browser credential. The same name in a different browser cannot recover that seat. Explicit leave removes the recovery credential. A restart discards all rooms; returning browsers receive an ended-night message and a working title screen.

```powershell
npm run assets
npm test
npm run test:e2e
```

The asset command reads the five supplied packs outside `game/`; the build needs only selected exports committed under `public/assets`. Production starts compiled JavaScript, with no development tools or debug endpoints. The selected CC0 assets and self-hosted fonts include their licences. Railway settings are in the root PLAN.md.
