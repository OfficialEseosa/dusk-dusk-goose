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

Open http://localhost:5174. The same Node process serves the built page and `/live` WebSocket. On a second laptop/phone on the same local network, use this computer's LAN address and port 5174, if the firewall permits it. Railway deployment comes at the end of step 2, not now.

## Step 1 checks

Enter a name and Create a night. Start is enabled with one person. Copy the invite into a second independent browser session, enter another name and Join. Both lists should update. Start changes the shared room to started; street rendering and gameplay belong to step 2 onward. Back to title leaves the seat and removes the room URL.

Refresh to return to the same seat. Two tabs can be different players. Close one tab, open its invite in a new tab in the same browser, and use Return as name to reclaim its disconnected seat using the private browser credential. The same name in a different browser cannot recover that seat. Explicit leave removes the recovery credential. A restart discards all rooms; returning browsers receive an ended-night message and a working title screen.

```powershell
npm run assets
npm test
npm run test:e2e
```

The asset command reads the five supplied packs outside `game/`; the build needs only selected exports committed under `public/assets`. Production starts compiled JavaScript, with no development tools or debug endpoints. The selected CC0 assets and self-hosted fonts include their licences. Railway settings are in the root PLAN.md.
