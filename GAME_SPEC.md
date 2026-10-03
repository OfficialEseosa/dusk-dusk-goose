# Last Night on Maple Street

## Purpose and status

This is the working specification for a two-player browser game. It replaces the earlier Claude-generated brief as the implementation reference. The original brief was inspiration, not a fixed contract.

The immediate task is to build the game's skeleton: a complete, playable, visually coherent graybox from joining a room to the ending, with real multiplayer and simple temporary artwork. Production illustrations, elaborate animation, and final audio follow after the mechanics work.

The user wants a game that ultimately looks excellent. Make structural decisions that support that goal without spending the skeleton milestone on final asset production.

The detailed story and puzzles below are proposed implementation defaults, not claims that the user has individually approved every creative choice. Proceed with these defaults for reversible work; flag material changes to the premise or scope.

## 1. The game in one paragraph

It is the last night of summer in 2002. Two best friends live across Maple Street from each other. A neighborhood blackout interrupts their evening, and they reconnect through walkie-talkies and flashlight signals. They set out to retrieve the friendship time capsule hidden beneath their old water tower before morning. One friend is moving away tomorrow and has not told the other. Each player sees a different part of the world and needs the other's light, observations, and help. A figure carrying a box adds unease as the friends make their way outside. The mystery resolves gently; the real stakes are their friendship and the goodbye they have been avoiding.

**Target experience:** an atmospheric, cooperative, bittersweet adventure lasting about 10–12 minutes for a first playthrough. This duration is a design target to validate through playtesting, not a timer or failure condition.

**Players:** exactly two active players for the initial release, each on a separate phone or computer.

**Tone:** summer-night mystery, warmth, and mild suspense. No combat, gore, jump-scare dependency, or punitive horror mechanics.

## 2. Design pillars

1. **Your friend changes your world.** Their flashlight and actions have visible effects on your screen.
2. **Both players matter.** Observation, interpretation, and interaction alternate between players.
3. **Friendship is expressed through play.** Helping, waiting, sharing, and signaling build toward the ending.
4. **A complete short experience.** Deliver a beginning, escalation, reveal, and resolution; no "to be continued" submission.
5. **Atmosphere with clarity.** Darkness creates mood but never hides the interface or makes essential objects unreadable.
6. **Easy to enter and recover.** Public browser link, room code, no player accounts or installation, reliable rejoin.

## 3. Characters and knowledge

Use editable default character names **Alex** and **Sam**. Player display names are separate from story identities, so dialogue does not require runtime rewriting.

- **Corner House / Alex:** wants to retrieve the time capsule and finish the summer ritual. Does not initially know about the move.
- **Blue House / Sam:** knows their family leaves in the morning. At the start, privately sees: "You leave tomorrow. You still haven't told Alex. Tonight might be your last chance."
- **The figure:** Sam's father, moving a box of belongings toward the family vehicle. His identity is initially obscured by darkness, not supernatural behavior.

The move is not a surprise to Sam. Clues such as tape, packed shelves, and a familiar silhouette foreshadow the reveal. Avoid implying a dangerous intruder and then dismissing the players' concern without explanation.

The players can speak freely in real life or through their own calls. The game does not try to enforce secrecy. An explicit story action records disclosure for branching; ordinary chat text is not automatically interpreted as a story choice.

## 4. Player journey

### Entry and lobby

- Title screen: **Start a Night**, **Join a Night**, concise premise, sound toggle.
- Creating a room produces a short, human-readable code without ambiguous characters, plus a copyable invitation link.
- Joining accepts a code and optional display name. An invitation link pre-fills the room.
- Choose Corner House or Blue House. Each role has one seat; concurrent claims must be resolved by the server.
- Show both players' connection and readiness states.
- Each player taps **Ready for the Night**. Use this interaction to initialize audio when supported.
- Start when both players are ready and assets required for the opening are loaded. No extra host-only start step is necessary.
- Explain only what is needed: "You see different things. Help each other over the radio."

### Act I — Lights Out, approximately 3 minutes

1. Brief date card: "August 30, 2002. 11:52 PM. Maple Street." The exact date is editable story data.
2. Both players see their own bedroom in warm lamplight.
3. A coordinated blackout removes the electric light. Moonlight remains sufficient to navigate.
4. Each player's walkie-talkie blinks. Opening it introduces contextual transmissions and optional text.
5. Both find functioning flashlights in obvious, different locations. Do not start with one player unable to interact while the other performs a long search.
6. At their windows, they learn to aim their beams across the street. Each sees a simplified distant silhouette of the friend responding.
7. First cooperative puzzle: Alex shines through Sam's garage window onto labeled storage shelves. Sam sees the shelf contents clearly only under that beam; Alex can see the window and beam aim but cannot read the contents from across the street. Sam retrieves the capsule route card from a tin box.
8. Sam returns the favor, illuminating Alex's side passage so Alex can retrieve the garden-gate key. Both have now guided and acted.
9. A figure with a box crosses the street. Each sees a different segment of the same journey. If a player misses the animation, persistent evidence and a short observation preserve comprehension.

### Act II — Across the Street, approximately 4–5 minutes

The friends decide to retrieve their time capsule before morning. A simple shared objective remains visible when needed.

**Cooperative sequence: the side passage**

- Alex navigates three visible stepping points along the passage. Sam, from a better angle, sees which path avoids a loose board and an obstacle.
- Sam directs light to a safe next point; Alex chooses when to move.
- Then roles reverse: Alex's new position gives a clear view of the latch Sam needs to reach outside Blue House.
- Missteps create a creak, a brief light flicker, and a local reset. Never reset the chapter, erase discoveries, or impose tight reflex timing.
- After repeated trouble, make the safe route clearer.

**The disclosure**

- Sam passes packed belongings and receives a private prompt: **Tell Alex now** or **Not yet**.
- Telling sends a clearly authored story transmission, distinct from free chat, and opens a short response choice for Alex.
- Deferring preserves the eventual reveal; Sam can still choose to tell before the finale.
- Both branches are emotionally valid. Do not award morality scores or label endings good/bad.

**Cooperative sequence: the capsule marker**

- One player has the old route card; the other sees the tower fence and matching landmarks.
- The route card encodes a short sequence using recognizable shapes, not color alone.
- The second player interprets that sequence against the landmarks. They then exchange roles for a final latch or marker interaction.
- The solution and visual mapping vary per room while remaining internally consistent.

### Act III — The Tower, approximately 3 minutes

1. The friends reach the base of the water tower. No climbing sequence is needed.
2. Their views now overlap: each sees the same clearing from a different side, including the other's silhouette and beam.
3. The figure is revealed as Sam's father near the moving vehicle. The moving context becomes visible to Alex if it was not disclosed earlier.
4. Together, the friends open the capsule using the signal pattern taught during Act I.
5. Display a small set of keepsakes: a shared photograph, a hand-drawn map, and a friendship token. For the skeleton these can be simple illustrated cards.
6. A short dialogue acknowledges either the earlier disclosure or the late discovery. Alex also makes a small response choice; both players participate in the resolution.
7. The neighborhood lights return in a coordinated sequence.
8. Final goodbye: each holds their flashlight signal. A forgiving overlap of approximately one second completes the gesture, with visible feedback showing when the other person is ready. Offer a tap-to-toggle alternative to sustained holding.
9. End card: the recovered keepsake, a brief branch-sensitive closing line, **Swap Roles and Play Again**, and **Return to Lobby**.

## 5. Core interaction model

### Viewpoints and navigation

Use fixed viewpoints with clear tap targets and short transitions. No free-roam character controller is required.

Suggested scene inventory:

| Stage | Corner House view | Blue House view |
| --- | --- | --- |
| Opening | Bedroom | Bedroom |
| First puzzle | Window / side yard view | Garage / front window |
| Passage | Side passage | Window, then back-door exterior |
| Route puzzle | Tower approach | Tower fence |
| Finale | Clearing, left perspective | Clearing, right perspective |

Reuse backgrounds and overlays where possible. Scene count is flexible if fewer scenes communicate the same actions clearly.

### Light

- Local flashlight follows pointer or touch input inside the game scene.
- Touch controls must distinguish aiming from deliberate object activation; tapping UI must not aim through the UI.
- Essential navigation and radio controls remain visible outside the flashlight mask.
- In explicitly linked views, beam direction is translated through a shared scene coordinate system into the partner's scene.
- Send normalized aim coordinates at a bounded rate and interpolate remotely. Do not send raw screen pixels or update persistent storage on every pointer move.
- The server validates puzzle-relevant illumination and actions. Visual beam movement may be locally predicted.
- Off-screen or disconnected players must not leave a puzzle permanently locked.
- Shared light is the signature mechanic. The skeleton must demonstrate it with actual remote state changes, not a canned animation.

### Radio

- Always reachable through a consistent, labeled control.
- Include contextual messages tied to discovered objects and current needs, such as "Light the upper shelf" or "I'm at the gate."
- Include short free text with a sensible length limit, sender identity, and recent message history.
- Quick replies alone must be sufficient to finish the designed puzzles without a microphone.
- Keep the world visible while reading messages where screen space permits.
- Story transmissions, system notices, and player messages have distinct presentation.
- Render user messages as text, never HTML. Apply server-side validation and rate limiting.
- Voice radio is a later enhancement, not a skeleton dependency.

### Hints and failure recovery

- Hints depend on the current unsolved step and what each role knows.
- After roughly 45–60 seconds without meaningful progress, softly highlight the radio or offer a contextual hint.
- A manual hint control is always available.
- Escalate from a nudge to an explicit next action. Do not reveal everything immediately.
- No irreversible puzzle failure, unwinnable branch, or permanent loss of a required object.

## 6. Visual and audio direction

**Working visual direction:** painted 2.5D suburbia, deep blue moonlight, warm amber flashlight beams, slightly crooked architecture, and tactile early-2000s objects. This direction can be revised during visual development.

Production scenes should use separate background, interactive prop, lighting, foreground, and interface layers. Modest parallax, foliage movement, dust, radio indicators, and light transitions can add life without full 3D.

For the skeleton:

- Use a deliberate small palette and simple original SVG, canvas, or CSS artwork.
- Make spatial relationships readable, with distinguishable houses and recognizable props.
- Keep scene layouts and interactive geometry independent of final asset filenames.
- Use an asset manifest so finished art can replace temporary art without rewriting puzzle logic.
- Do not generate a large final asset pack before the interaction design has been tested.
- Avoid generic dashboard cards as the main game presentation. The scene should dominate the screen.

Audio direction: crickets, wind, distant neighborhood sounds, quiet floorboards, radio crackle, and a restrained musical finish. The skeleton may use a few synthesized cues or appropriately licensed placeholders. No essential clue may require hearing.

Provide separate overall mute and readable captions for authored spoken content. Respect reduced-motion preferences. Sound must only begin after a suitable user interaction and must fail gracefully if unavailable.

## 7. Device support and accessibility

- Target recent mobile Safari and Chrome plus desktop browsers.
- Prefer landscape for the scene, but allow lobby and code entry in portrait. Avoid trapping users behind an unnecessary setup overlay.
- Adapt the play interface to portrait where practical; if landscape is necessary for a particular scene, show a clear rotation prompt with access to help and sound settings.
- Use feature detection for fullscreen. Never require installing to the home screen.
- Respect safe areas, browser toolbars, small screens, and the on-screen keyboard.
- Give controls clear labels, visible focus states, adequate contrast, and generous touch targets.
- Support keyboard navigation and an alternative to precise pointer aiming, such as selectable beam anchor points.
- Do not distinguish puzzle answers by color alone.
- Ordinary play and the opening continue while both players are connected, even if one tab is hidden. Returning tabs catch up from the authoritative snapshot. A deliberate beam has a ten-second handoff window after hiding, then turns off; hidden input cannot renew it. Disconnects and phase transitions clear beams. The final goodbye requires both tabs visible and a fresh signal after returning. Actual disconnection pauses progression until recovery. This narrows the original visibility rule following the October 3 audit so players can test by switching tabs.

## 8. Multiplayer and state architecture

Choose a maintainable TypeScript implementation with a real authoritative backend and a realtime transport. A reasonable local default is a web client plus a Node server using WebSockets or Socket.IO. Inspect any existing project and applicable instructions before choosing or replacing its stack.

Do not choose an external paid service or require credentials merely to start local development. Document hosting requirements honestly; a multiplayer backend cannot be replaced by static hosting alone.

### Authoritative state

- Room identity, creation/expiry time, and room seed.
- Player seats, reconnect credentials, display names, presence, and readiness.
- Current act, story beat, checkpoints, and transition timestamps.
- Inventory, clue discoveries, puzzle variants, completed actions, and puzzle-relevant beam state.
- Disclosure status, authored response choices, and ending state.
- Recent radio messages and restart/replay agreement.

### Local state

- Open panels, settings, rendering state, animation interpolation, and local pointer feedback.
- Current viewpoint may be locally responsive but must be reported/validated when it affects available interactions.
- Never trust a client-provided "puzzle complete" or arbitrary story phase.

### Required behavior

- Model the story as explicit phases with legal transitions and idempotent actions.
- Schedule synchronized effects against a shared server timestamp with client clock-offset handling; "simultaneous" means perceptually aligned within a documented tolerance, not perfect zero-latency delivery.
- Deliver snapshots on joining/rejoining and ordered or revisioned updates afterward.
- Separate ephemeral beam/presence updates from durable progression.
- A display name is not authentication. Use an unguessable reconnect token retained locally; do not let someone steal a seat by entering the same name.
- A valid reconnect token immediately transfers its seat to the new connection. Tell the older tab that play continued elsewhere and suppress automatic reclaiming. Fresh tabs may join the other seat without automatically using a remembered token; offer explicit Resume, and recover a remembered seat on a full-room code join.
- Expire abandoned rooms and bound message history and room counts.
- Handle invalid/full/expired rooms, role races, duplicate tabs, repeated input, disconnects, and reconnects explicitly.
- For the skeleton, in-memory rooms are acceptable if server-restart loss is clearly documented. Browser refresh/rejoin must still work while the server remains running.
- Do not broadcast private story text or unrevealed role-specific clue contents indiscriminately to both clients.

## 9. Replayability

Offer role swapping and a new room seed on replay. Vary the shelf target, route mapping, and keepsake selection from a small authored set. Every generated configuration must be solvable.

The skeleton needs at least two validated configurations for the core puzzles. Replayability should change what players must observe, not just shuffle cosmetic decorations. The central story can remain authored and consistent.

## 10. Scope boundaries

### Skeleton milestone — implement now

- Create/join lobby, exclusive role selection, readiness, and invitation links.
- Real two-client state synchronization and reconnect tokens.
- Complete three-act graybox with a real ending.
- Shared flashlight effect and reciprocal first puzzle.
- Simplified passage and route puzzles that preserve both players' participation.
- Contextual radio plus short text messages.
- Early/late disclosure branch and finale signal.
- Small seeded puzzle variation, replay, and role swap.
- Coherent temporary art, basic responsive controls, captions, mute, and hints.
- Development-only way to start two clients and inspect/reset a test room.
- Setup instructions, architecture summary, known limitations, and test results.

### Production polish — subsequent milestones

- Art-direction comparisons followed by a polished reference scene.
- Consistent final room art, props, character silhouettes, layered animation, and lighting.
- Final sound design and dialogue refinement.
- More substantial mobile/accessibility testing and performance optimization.
- Production room persistence if needed, deployment, and public-network testing.
- Contest cover image and a clear project description.

### Optional after the core succeeds

- Voice radio with text fallback.
- Additional puzzle variants and keepsakes.
- Solo companion mode, additional roles, or spectators only if there is a clear benefit and time remains.
- Full 3D only if a prototype establishes a compelling benefit; it is not needed for this design.

These boundaries are prioritization decisions, not permanent prohibitions.

## 11. Skeleton acceptance criteria

1. Two independent browser contexts create/join a room and occupy different roles.
2. Invalid codes, full rooms, and simultaneous role claims produce clear behavior.
3. Both players become ready and see an aligned blackout.
4. Moving one player's beam visibly changes the other player's puzzle scene.
5. Neither side can finish the cooperative sequence without a meaningful action from the other role.
6. Both players can finish the story with contextual messages and no voice input.
7. Both disclosure branches reach a coherent ending.
8. A player can refresh, disconnect briefly, or leave the tab for 30 seconds and return to the correct seat and progress.
9. A second browser with the same display name cannot take over that seat.
10. Duplicate actions cannot skip story phases or grant a reward twice.
11. Two seeded puzzle configurations are solvable; replay resets state consistently for both players.
12. Finale synchronization is forgiving and has visible partner feedback.
13. Small-screen layouts keep required controls usable, including when text entry opens the keyboard.
14. Console errors and failed network requests are investigated; automated checks and known untested behaviors are reported accurately.

Prefer meaningful tests of room lifecycle, state transitions, role authorization, seeded puzzle solvability, and reconnect behavior. Add a browser integration test covering a two-player completion path if the environment supports it. Do not substitute mocked multiplayer for this check.

Real iPhone/Android testing and two devices on different networks remain release requirements. Do not claim them based only on desktop emulation.

## 12. Delivery and development workflow

Start by inspecting the workspace and applicable AGENTS.md files. Establish a concise implementation plan, then proceed with the authorized skeleton work. Do not stop after scaffolding or a landing page.

Keep game rules and authored content separate from rendering and transport. Use readable types and small modules rather than a single oversized component. Record important decisions in the README.

Build a thin end-to-end path first, then fill in the puzzles. Test the two-player loop early. Keep progress updates focused on behavior that works and remaining limitations.

Do not install unrelated plugins, create user-owned chats, publish externally, submit the contest entry, or purchase services as part of this local skeleton milestone.

At completion, provide:

- The local launch command and any running preview URL.
- How to test with two independent browser contexts and two devices when networking permits.
- What is implemented, what is intentionally temporary, and any remaining blockers.
- Checks actually run and their outcomes.
- A recommended next milestone: one production-quality playable scene.

## 13. Contest context

The supplied official rules weight Execution, Creativity, Usefulness / Value, and Polish & Thoughtfulness equally at 25% each. Optimize for a reliable, complete, delightful experience.

The public mission describes a browser multiplayer game with room codes, no player login or install, synchronized screens, a public URL, and replayability. Verify the in-product mission requirements before final submission rather than relying solely on this summary.

The supplied PDF lists October 30, 2026 at 11:59 PM Pacific as the entry deadline; the public mission page says October 31. Plan around the earlier deadline unless the organizer clarifies otherwise.

Submission assets include a title, cover image, description, and project link. Preparing these follows the playable game; submission itself requires a separate user request.

Sources reviewed during concept assessment:

- Original idea: C:/Users/rapha/Downloads/last-night-on-maple-street-brief.md
- Supplied rules: C:/Users/rapha/Downloads/[AI_Skills_Studio_Challenge]_Contest_Official_Rules.pdf
- Public mission: https://joinhandshake.com/learn/create-a-multiplayer-game-8d7d59b5/
