# Railway deployment

Prepared October 4, 2026. These are owner instructions. No public deployment was made during this finishing pass.

## Production commands

The service root is `/game`. Use Node 22, as required by `package.json`, and the committed lockfile. Selected assets already live in `public/assets`; source ZIPs and asset intake are not needed on the host.

Enter this exact Railway **Build Command**:

```sh
npm ci --include=dev && npm run build && npm prune --omit=dev
```

TypeScript, Vite and font packages are needed during compilation. Explicitly including development dependencies keeps the build working with `NODE_ENV=production`. Pruning afterwards removes development tools from the runtime install. Enter this **Start Command**:

```sh
npm start
```

This runs `node dist/server/server/index.js`. One Node process serves `dist/client` and `/live`, binds `0.0.0.0`, and reads the host's `PORT`. It starts without a watcher or TypeScript loader. [Build settings](https://docs.railway.com/builds/build-configuration), [start command](https://docs.railway.com/deployments/start-command).

Reproduce from a fresh checkout, inside `game/`:

```sh
npm ci --include=dev
npm run build
NPM_CONFIG_PRODUCTION=true npm prune --omit=dev
NODE_ENV=production NPM_CONFIG_PRODUCTION=true PORT=5183 npm start
```

On Windows PowerShell, run:

```powershell
$env:NODE_ENV = 'production'
$env:NPM_CONFIG_PRODUCTION = 'true'
$env:PORT = '5183'
npm ci --include=dev
npm run build
npm prune --omit=dev
npm start
```

Open `http://localhost:5183/`. Restore development tools with `npm ci --include=dev` before running tests or rebuilding.

## Owner setup

1. Connect GitHub to Railway. Create an empty project and **one empty service**, then connect `OfficialEseosa/last-night-on-maple-street`, branch `main`. Configure staged settings before applying them. Do not import the retired repository-root application or retain automatically suggested extra services. No database, Redis or volume is needed.
2. In service **Settings**, set **Root Directory `/game`**, the Build Command above, and **Start Command `npm start`**. Use Railpack. The package engine and explicit variable below select Node 22. Set **Healthcheck Path `/`**, with the normal 300-second timeout. The ordinary game page returns 200, so no diagnostic route is needed. [Monorepo root](https://docs.railway.com/deployments/monorepo), [Railpack](https://docs.railway.com/builds/railpack), [healthchecks](https://docs.railway.com/deployments/healthchecks).
3. Add these service **Variables**. Leave `PORT` unset so Railway supplies it.

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `NPM_CONFIG_PRODUCTION` | `true` |
   | `RAILPACK_NODE_VERSION` | `22` |
   | `RAILPACK_NO_SPA` | `1` |
   | `MAX_ROOMS` | `25` |
   | `MAX_PLAYERS_PER_ROOM` | `6` |
   | `ROOM_IDLE_TTL_SECONDS` | `600` |
   | `SEAT_RECONNECT_TTL_SECONDS` | `600` |
   | `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS` | `0` |
   | `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `0` |

   Railpack normally sets `NPM_CONFIG_PRODUCTION=false`; overriding it keeps the final prune effective. The install explicitly includes dev dependencies anyway. `RAILPACK_NO_SPA=1` keeps the Node/WebSocket server in charge despite Vite detection. [Railpack Node configuration](https://railpack.com/languages/node/).

   No persistent credentials are required. Rooms live in memory and a restart loses them. Clients recognize the new server identity and return to the title with an ended-night message. Railway uses the injected port for readiness checks. [Port behavior](https://docs.railway.com/deployments/healthchecks).
4. Choose one region near your testers and **exactly one replica total**. Keep **Serverless OFF**, previously called App Sleeping. Do not add another region, replica, preview/PR environment, cron run or Node cluster worker. Set **Restart Policy `On Failure`**, maximum **10 retries**. Automatic resource allocation within this one container is compatible with one room owner. [Replicas](https://docs.railway.com/deployments/scaling), [Serverless](https://docs.railway.com/deployments/serverless), [restart policy](https://docs.railway.com/deployments/restart-policy).
5. In GitHub source settings click **Disable** for automatic deployments. Keep overlap and draining at zero. Normal replacement can start a new container before retiring the old one; zero overlap does not enforce our stricter one-process rule. Use the stop-first procedure below for subsequent updates. [Disable autodeploy](https://docs.railway.com/deployments/github-autodeploys), [teardown](https://docs.railway.com/deployments/deployment-teardown).
6. Only after deployment is authorized, apply the staged configuration and choose **Deploy Latest Commit** from Railway's command palette. Check that logs show explicit install, compilation, pruning and one Node start. Do not purchase services or add paid billing during this setup.
7. Under **Settings > Networking > Public Networking**, choose **Generate Domain**. Use the detected service port as its target. Railway supplies one HTTPS address; the game derives `wss://` from that same address. No second frontend host or TCP proxy is needed. [Domain setup](https://docs.railway.com/networking/domains/working-with-domains).
8. Open that address on two phones on different networks. Check room joining, solo Start, movement and blackout. Refresh, lock/unlock, switch networks, complete a match and run a ten-minute session. With testers warned and no matches running, restart once: both clients must return to the ended-night title and create another room. Inspect host logs and CPU/RAM before inviting more players.

## Stop-first updates

Never update while a match is running. Check with testers first; there is deliberately no public room-inspection endpoint. Freeze deployments during judging.

1. Confirm the intended commit is on connected `main` and checks pass.
2. Under **Service > Deployments**, open the active deployment's three-dot menu and choose **Remove**. Confirm it has stopped and no other deployment runs before proceeding. This causes brief downtime and loses rooms.
3. Open the command palette and choose **Deploy Latest Commit**. Confirm exactly one instance becomes active and the ordinary page passes readiness.
4. Repeat the two-device join/recovery check. Stop the active server before restoring an older image or commit too.

Railway documents Remove as stopping usage and manual latest-commit deployment through its command palette. The deployment healthcheck checks initial readiness, not continuous uptime. [Deployment actions](https://docs.railway.com/deployments/deployment-actions), [healthcheck limits](https://docs.railway.com/deployments/healthchecks).

## Verification limits

The finishing report records a fresh source-only copy, lockfile install including build dependencies, compilation, pruning and production launch on an assigned local port. It checks HTTP assets and WebSockets on the same listener, unavailable development/debug routes and absent development packages at runtime. It does not establish Railway's Linux container behavior, TLS proxy, billing, permissions, actual account settings or cellular networks. Those remain owner checks after deployment is authorized. Vite currently emits a bundle-size advisory while compilation succeeds.
