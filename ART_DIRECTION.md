# Artwork handoff

The skeleton renders original vector geometry. Production art should preserve the normalized scene coordinates used by interaction anchors; do not bake interface labels or clues into backgrounds.

Recommended layered deliverables per viewpoint: background, house/interior architecture, interactive props, distant friend silhouette, foreground foliage, light response/masks. Export at a common 16:9 artboard with mobile-safe focal framing. Keep authored dialogue and puzzle labels in accessible HTML. A finished illustration can replace one manifest entry without changing server rules.

First reference scene: the reciprocal garage-window puzzle. Establish deep-blue moonlight, amber remote flashlight, readable tin-box shelves, Alex's distant silhouette, subtle foliage and dust, then validate on phone and desktop before extending the style to the remaining scenes.

Production artwork URL slots live in `src/content.ts` (`ASSETS`), with separate bedroom, garage, street, and tower entries. Background and foreground replacements render around the existing interactive props and light layer in `src/scene.ts`. Authored phase captions live in `server/story.ts`; interaction targets and puzzle variants remain in `server/game.ts`.
