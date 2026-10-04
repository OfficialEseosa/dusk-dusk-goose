# Last Night on Maple Street — replayable version (Option 2)

Written 2026-10-03. This replaces the chapter design and the three prompts in `WIN-PLAN-2026-10-03.md`. The rest of that plan (contest facts, asset kits, sound sources, schedule, how to prompt) still applies.

Everything in sections 1–3 is a proposed default. Change anything you dislike before sending it to ChatGPT; it is much cheaper to change here than after it is built.

## 1. The game in three sentences

It is the last night of summer, 2002, and the power is out on Maple Street. One player secretly buries the friends' time capsule somewhere on the dark street; everyone else has a few minutes to find it with flashlights and walkie-talkies. Then the roles rotate, and the best night wins.

- **Players:** 2 to 6, each on their own phone or laptop, joined by room code. No login, no install.
- **Length:** a round is about 3 minutes. A full game is one round per player as the hider (two rounds each with two players).
- **One person:** there is no separate single-player mode. The normal game works with one person in the room. They create a night and get a code as usual, and can press start even if nobody has joined. With one person, the game itself is the hider every round: it buries the capsule, lays the footprints including one false trail, and radios a true clue every 30 seconds. The lone player always seeks and is scored on how fast they find it. If a friend joins with the code between rounds, the next round is a normal round with a human hider.

## 2. One round

1. **Lights out (about 10 seconds).** Everyone starts in the street under working streetlamps. The power cuts on every screen together. Real darkness.
2. **Hiding (about 25 seconds).** The hider walks the street and buries the capsule at any hiding spot (a mailbox, a hedge, under a porch, behind a bin, and so on). Meanwhile the seekers are in a bedroom finding their flashlights, so nobody stares at a waiting screen.
3. **Seeking (about 2 minutes).** Seekers walk the street together. Things only show up inside a flashlight beam:
   - the hider's **footprints**, which fade over time and can only be seen when lit;
   - which hiding spots look **disturbed**.
   Searching a spot means standing next to it and holding the action button for two seconds. A wrong spot costs that time and makes a noise.
4. **The hider keeps playing.** During the seek the hider is "the figure with the box": they can walk the dark street without a light to lay false footprints, but a seeker's beam that lands on them freezes them for a moment. Once every 30 seconds the hider must send one true clue over the radio, chosen from a few the game offers (for example "it is on the odd-numbered side").
5. **End of round.** The capsule is found or time runs out. A short reveal shows where it was and the path everyone took. Scores update, the next hider is announced, and the next round starts.

**Scoring:** seekers share points for a fast find; the hider scores for every second the capsule stays hidden. Highest total after everyone has hidden wins. The end screen offers Play Again with the same group.

**Why it replays:** a different hider each round, a choice of many hiding spots, false trails, and a street layout picked from a small set each game.

**What survives from the story:** the date card, the blackout, the walkie-talkies, the figure with the box, and a closing line on the final scoreboard about the last night of summer. The moving-away story becomes mood, not plot.

## 3. Controls and screen

- **Phone, landscape:** move stick on the left. On the right, an action button that appears only when you are next to something (Search, Bury, Pick up), plus a radio button that is always there.
- **Flashlight:** points where you are facing. No aiming control.
- **Laptop:** arrow keys or WASD to walk, one key for the action, one for the radio.
- **Radio:** a few quick phrases that change with the moment, plus short typed messages. A crackle with every message.
- **View:** real 3D, low-poly, seen from a fixed raised angle that follows your character along the street.
- **Screen:** fills the display, never scrolls or zooms. Fullscreen button on Android and desktop. On iPhone, a one-time "Add to Home Screen" tip instead, because iPhone Safari cannot fullscreen a web page.

## 4. Two things to settle before building

1. **Is Vercel allowed?** The public mission page asks for "a ChatGPT account with Work mode" and the rules PDF does not define "built in ChatGPT". I could not see the signed-in mission page or the Code of Conduct. Read both. If hosting elsewhere is not clearly allowed, ask the organizers in writing, or publish on ChatGPT Sites.
2. **Where does ChatGPT work?** I still do not know whether ChatGPT is editing this local folder or building separately. The prompts below assume it can create a fresh project and that you will deploy it to Vercel.

## 5. What Vercel needs from the game

Vercel can hold live connections, but not the way the current server does:

- Room state must live in an external store (Redis from Vercel's marketplace), never in server memory. A reconnect or a new deploy can land on a different server copy.
- Players in one room may be connected to different server copies, so updates must be passed between copies through that store.
- Connections are cut at the function time limit (5 minutes on the free plan). Every device must reconnect quietly and carry on in the same seat, without the player noticing.
- The client must connect by WebSocket directly.

## 6. Standing rules for ChatGPT

Paste once and keep as the project's instruction file.

```
PROJECT: Last Night on Maple Street. A replayable hide-and-seek party game in the
dark for 2 to 6 players on their own phones or laptops, for the Handshake x OpenAI
"Create a Multiplayer Game" challenge. Hosted on Vercel.

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
- The server decides everything players share: where the capsule is, positions,
  footprints, timers, scores. A player's device never learns where the capsule is
  until it is found or the round ends.
- Room state lives in an external store, never in server memory. A dropped or
  recycled connection reconnects by itself and the player keeps their seat.
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
```

## 7. Prompts, in order

```
PROMPT 1: Plan and look, for my approval (build nothing yet)

[Paste the standing rules.]

This is a fresh project. Do not reuse the earlier story-game code.

Write a short plan covering:
- How 2 to 6 players stay in sync on Vercel, given that room state must live in
  an external store and connections will be recycled every few minutes.
- What the server decides and what each device decides. How you keep the capsule
  location secret from seekers' devices.
- How often positions and flashlight directions are shared, and how other
  players' movement is smoothed on screen.
- The street: its size, how many hiding spots, and how layouts vary between games.
- Which free low-poly kits you want me to supply (I can provide Kenney City Kit
  Suburban, Furniture Kit, Car Kit, Blocky Characters, and KayKit packs) and how
  you will keep the scene light enough for a mid-range phone.
- The order you will build in, as small steps I can test on two phones.

Then make three mood images of the street at night after the power cut, seen from
a fixed raised angle: low-poly 3D, deep blue moonlight, two or three warm
flashlight beams, footprints visible only inside a beam. Vary the style between
the three. I will pick one.

Tell me anything in the rules above that you think is a mistake. Then stop and
wait for me.
```

```
PROMPT 2: The street, two phones, final quality

[Paste the standing rules.]

Build and deploy one slice at final quality, nothing more:
- Title screen. Create a night, join with a code, see who is in the room, one tap
  to start (this tap turns on sound).
- Everyone appears on the same 3D street in the approved style, lamps on. Then
  the power cuts on every screen together and it goes properly dark.
- Walk with the left stick or the keyboard. Each player has a flashlight that
  points where they face. Every player sees every other player and their beam.
- Crickets, a hum that stops at the power cut, a click for the flashlight.

Done when:
1. Two phones on different networks join the same night from the public address.
2. On a small phone in landscape nothing scrolls and nothing is cut off.
3. All screens go dark within a moment of each other.
4. When I walk or turn, my friend sees it within about a quarter of a second,
   moving smoothly rather than jumping.
5. Two tabs in one browser window can both play, and hiding one does not freeze
   the other.
6. Refreshing a phone returns it to the same room and the same character.
7. Leaving the game open for ten minutes does not drop anyone out of the room.
8. It runs smoothly on a mid-range Android phone.
9. You have looked at it yourself at phone and laptop size, with two sessions, and
   told me what you saw.

Do not build hiding, seeking, footprints, radio or scoring yet.
```

```
PROMPT 3: One complete round

[Paste the standing rules.]

On top of the working street, build one full round:
- One player is chosen as the hider. They get about 25 seconds to bury the
  capsule at a hiding spot using the action button. During that time the seekers
  are in a bedroom picking up their flashlights.
- Seeking lasts about two minutes. The hider's footprints fade over time and are
  visible only inside a flashlight beam. Searching a spot means standing next to
  it and holding the action button for two seconds; a wrong spot costs that time
  and makes a noise everyone hears.
- The hider walks the dark street without a light and can lay false footprints. A
  seeker's beam landing on the hider freezes them briefly.
- Every 30 seconds the hider must send one true clue, picked from three the game
  offers. Clues narrow the search without giving the spot away.
- The round ends when the capsule is found or time runs out, with a short reveal
  of where it was.

Done when:
1. With two players, a full round can be played from start to reveal.
2. A seeker cannot discover the capsule's location by any means other than
   searching the right spot.
3. Footprints are invisible outside a beam and visible inside one, on every
   seeker's screen.
4. The clues the game offers are always true.
5. If the hider disconnects, the round still ends properly.
6. You have played a round yourself with two sessions and told me what happened.

Do not build scoring, role rotation or the radio chat yet.
```

After Prompt 3: scoring and rotating hiders, the radio, the solo practice night, the end screen with Play Again, then sound and small details. One per prompt. Bring each stage back for an audit.

## 8. Schedule

| Dates | Goal |
|---|---|
| Oct 3–5 | Settle the Vercel question. Prompt 1. Pick the look. Download the kits. |
| Oct 6–12 | Prompt 2 live on two real phones. If walking 3D is not smooth by the 12th, simplify the scene before adding anything. |
| Oct 13–18 | Prompt 3, then scoring and rotation. Audit. |
| Oct 19–24 | Radio, solo practice night, end screen, sound. Audit. Strangers playtest with 3 or more players. |
| Oct 25–28 | Fix what playtests found. Freeze. Cover image, title, description. |
| Oct 29 | Submit. Oct 30 is buffer only. |

## 9. Risks to watch

- **Smooth movement over the network** is the hardest part of this design and is proven or disproven by Prompt 2. Everything else is ordinary.
- **Two-player rounds** may feel thin with one seeker. If so, give the lone seeker the game's own clues more often.
- **Balance** (round length, footprint fade time, number of hiding spots) can only be tuned by playing with real people. Budget time for it.
- **Eligibility** of a Vercel-hosted entry is unconfirmed.
