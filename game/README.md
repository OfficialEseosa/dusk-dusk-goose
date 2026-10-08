# Dusk Dusk Goose

A 3D infection-tag party game for 1–6 players. Play starts a solo survival run immediately. Friends join with the room code; at the next break everyone enters a shared round with computer players filling empty seats. A caught kid becomes a goose and keeps playing.

Run `npm ci`, `npm run build`, then `npm start` from this directory with Node 22. The compiled Node server serves the page and `/ws` from one address; `PORT` defaults to 5173. See [DEPLOY.md](DEPLOY.md) for the exact Railway build/start and single-instance requirements. No deployment has been performed.

Move with WASD/arrows or the left thumb stick. Hold Space/J or the right action button to shine the self-aiming light as a kid; press it to lunge as a goose. M mutes, F requests fullscreen. Refresh or a dropped connection recovers the private seat while the room exists; a server restart returns players to the title.

`npm test` runs current and retained server tests. `npm run test:e2e` builds and runs current browser tests, then the original hide-and-seek checks in an isolated historical fixture. The retired story project is preserved under `../legacy/story`; root scripts include its tests too. Historical documentation and unused assets are in `../legacy/` and do not ship in the active page.

See [SOUND_CHOICES.md](SOUND_CHOICES.md), [FEEDBACK_VERIFICATION.md](FEEDBACK_VERIFICATION.md), [NETWORK.md](NETWORK.md), and the repository's `PLAN.md` for evidence and known limits. Selected assets and licences are documented in `public/assets/chase/MANIFEST.md`.
