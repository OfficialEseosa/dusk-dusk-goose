# Dusk Dusk Goose

A 3D infection-tag party game for1–6 phones or laptops. Run as a kid, freeze geese with your flashlight, and join the flock when caught. Alone, survive a growing flock; friends join with a room code.

The active application lives in `game/`:

```sh
cd game
npm ci --include=dev
npm run build
npm start
```

Open the printed address. Keyboard: WASD/arrows and Space. Phone: move stick and one action button. `M` mutes sound; `F` toggles fullscreen where supported. Rotate a phone to landscape. Rooms and private seats survive reconnects while the single server lives; restart ends every room.

See [final verification](game/FINAL_VERIFICATION.md) for checks, screenshots and remaining quality gaps, [PLAN.md](PLAN.md) for phase decisions/results, [deployment instructions](game/DEPLOY.md), [sound choices](game/SOUND_CHOICES.md) and [feedback verification](game/FEEDBACK_VERIFICATION.md). No public deployment has been made.

The retired root story application, documents and unchanged tests are retained under `legacy/story/`; they are historical compatibility coverage. Old hide-and-seek source/tests inside `game/` run in a separate compiled compatibility fixture. Neither archived application is the active production entry. Original history remains under the tag `old-game-end-f802515`.
