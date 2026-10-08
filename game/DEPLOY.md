# Dusk Dusk Goose on Railway

Repository: `OfficialEseosa/dusk-dusk-goose`, branch `main`. Service root: `/game`. Node22 is required. No deployment has been performed by this build task.

## Build and start

Use the committed lockfile from `game/`:

```sh
npm ci --include=dev
npm run build
npm prune --omit=dev
npm start
```

The Railway build command is `npm ci --include=dev && npm run build && npm prune --omit=dev`. The start command is `npm start`, which executes `node dist/server/server/chase-server.js`. Vite, TypeScript and fonts are build dependencies only. Selected assets are committed under `public/assets`; ignored source packs are unnecessary.

The process binds `0.0.0.0` and reads the host's `PORT`. The same public HTTPS address serves the page and `/ws` WebSocket. Use `/` for the health check. There are no diagnostic endpoints. No database, Redis, volume, separate frontend service or second game process is needed.

Local PowerShell production start after the build/prune:

```powershell
$env:NODE_ENV = 'production'
$env:PORT = '5183'
npm start
```

Open `http://localhost:5183/`. Restore development dependencies with `npm ci --include=dev` before running tests or rebuilding.

## Required hosting configuration

- Exactly one always-on service instance. Disable sleeping/serverless operation, extra replicas, cluster workers and process-manager clustering.
- Prevent overlapping old and new game processes: stop the previous instance before starting the next. Configure stop-first deployment or manually stop the service before applying an approved deployment if the platform cannot guarantee it.
- Disable automatic deployment while people are playing. Deploy only after matches finish; freeze deployments during judging. This task does not deploy.
- Keep rooms in process memory. Restart/redeploy loses all rooms; reconnecting players receive the friendly ended-night message and return to the title. A name never recovers a seat.
- Keep the public domain's WebSocket connection supported; the browser automatically uses `wss:` under HTTPS.

Rooms are capped at25, seats at6, event history at48 per simulation, and position history at500ms. Disconnected seats expire after20s; abandoned rooms after60s. Payloads, message rate, origin and movement are validated.

## Verification status

Final Phase6 isolated check in a fresh `.production-final-20261007` copy (including Cul-de-sac, final quality sampler and selected assets): `npm ci --include=dev` installed33 packages, zero reported vulnerabilities; `npm run build` passed; `npm prune --omit=dev` removed31 development packages, zero reported vulnerabilities. `node scripts/production-check.mjs .production-final-20261007` passed compiled startup using the exact `npm start` target, environment port5183, page200, WebSocket solo, restart/ended-night and absent-development-loader checks. `/__debug`, `/@vite/client`, `/server/chase-server.ts` and `/live` returned404. See `evidence/phase6/production-check.json`.

Actual Railway provisioning, stop-first behaviour, public TLS and real-phone browser behaviour have not been checked because deployment is outside authorization.
