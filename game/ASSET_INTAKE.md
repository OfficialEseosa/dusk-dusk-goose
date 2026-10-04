# Asset intake

Run `node scripts/assets.mjs` from `game/`. It validates the exact supplied selection before writing anything, then copies only selected original models, their referenced textures, and the five licence files into `public/assets/kenney/`. All original filenames and texture-relative paths are preserved. Missing or changed names fail with the exact missing path; the importer does not guess a replacement or rename user files.

The supplied five Kenney folders match the plan. There are no filename discrepancies. Furniture uses `Models/GLTF format/` for its GLB files and embeds its data; the other packs use `Models/GLB format/`. Blocky character images use external `Textures/texture-a.png` through `texture-f.png`, which are included.

## Verified selection

| Pack | Selected models | Selected mesh triangles |
| --- | ---: | ---: |
| City Kit Suburban | 14 | 9,826 |
| Furniture Kit | 12 | 1,224 |
| Car Kit | 4 | 4,570 |
| Blocky Characters | 6 | 432 |
| City Kit Roads | 7 | 1,148 |
| Total | 43 | 17,200 |

Selected files and textures total 2,264,359 bytes (2.16 MiB). This is a catalogue total, not a promise of final scene cost: instancing, repeated buildings, added props, alternative characters and lights are not counted here. Source ZIPs, FBX/OBJ variants, previews and unused models are not copied into the game.

`public/assets/manifest.json` records pack origin, CC0 licence, exact source and runtime paths, SHA-256 hashes, size, triangle count, mesh-local accessor bounds, material count, skins and animation clip names. Bounds are explicitly mesh-local unions, not final transformed scene bounds. World scale, authored colliders and animation mapping will be verified in the step 2 visual slice, not fabricated during intake.

The supplied character files contain `idle`, `walk`, `sprint`, `pick-up` and holding/interacting clips, among others. They are retained as supplied assets, but are not the approved normal-proportioned runtime character choice. Step 1 does not render a character or street.

## Mood A character recommendation, not imported

The free **[Universal Base Characters](https://quaternius.itch.io/universal-base-characters)** archive is exactly `Universal Base Characters[Standard].zip`. The author's page confirms regular and teen proportions, male and female bases, humanoid rigs and CC0, with an average 13,000 triangles per character. Download the Standard file using the free option, not the paid Source version. Extract the complete archive under `assets/source/quaternius/universal-base-characters/`, preserving its internal names.

For compatible movement animation, the free **[Universal Animation Library](https://quaternius.itch.io/universal-animation-library)** archive is exactly `Universal Animation Library[Standard].zip`. Extract under `assets/source/quaternius/universal-animation-library/`, preserving its internal names. Use its no-root-motion animation version so animation never moves the client character independently of input.

These are base bodies, not six finished 2002 neighbourhood outfits. They require casual clothing/hair selection, palette adaptation and retargeting. Aim for approximately 3,000 to 5,000 triangles per dressed runtime character through controlled simplification and removal of hidden body geometry; inspect shoulders/hands and animation silhouettes before accepting the result. Six original 13,000-triangle bodies would consume most of the proposed street budget before clothes or scenery.

Archive names, licence, formats and published triangle figures were verified on the primary author's pages. Internal filenames are deliberately not guessed: verify the user's downloaded archive on arrival and list the chosen teen/regular files then. Neither archive has been downloaded or imported, and no alternative characters will be used before the user supplies them.

The older Ultimate Animated Character pack and Ultimate Modular Women pack provide finished characters and CC0, but their dated adult silhouettes/outfits are less suited to the requested summer-2002 teen diorama. Their public pages do not expose verifiable free archive filenames here. Avoid asking the user to download an unverified filename or claiming a ready-made outfit match.

## To approach Mood A within the phone budget

Preserve the selected suburban silhouettes, then add restrained roof/facade detail and a few authored porch/mailbox props; darken and regroup the existing trees into irregular framing masses rather than adding thousands of grass cards. Use palette tints, one small tiling road/sidewalk surface map and sparse ground detail inside the camera focus. Build the raised three-quarter composition with houses across the upper frame and the sidewalk/road below; use deep blue ambient light and genuine warm spotlights with economical cone volumes. Keep expensive blur, screen-space ambient occlusion and full-scene volumetric lighting optional or absent on phones.

Additional scenery downloads are not required before step 2. The five supplied packs are sufficient for the first assembled street; the two character Standard archives above are the only recommended new downloads. At the end of step 2, compare an actual game screenshot alongside Mood A and report geometry, material, lighting and character differences honestly.
