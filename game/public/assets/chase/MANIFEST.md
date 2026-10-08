# Dusk Dusk Goose art sources

Only these selected files are shipped from the supplied local packs. All three
Kenney packs are CC0; each pack's original License.txt is beside its models.
Source filenames and palette paths are preserved. No assets were downloaded.

- mini-characters: character-female-a.glb, character-female-c.glb,
  character-female-e.glb, character-male-a.glb, character-male-c.glb,
  character-male-e.glb; Textures/colormap.png. Source:
  assets/source/kenney/mini-characters/Models/GLB format/.
- graveyard-kit: pine.glb, pine-fall.glb, pine-fall-crooked.glb, bench.glb,
  pumpkin-carved.glb, pumpkin-tall-carved.glb, iron-fence.glb,
  lightpost-single.glb, hay-bale.glb, lantern-glass.glb;
  Textures/colormap.png. Source:
  assets/source/kenney/graveyard-kit/Models/GLB format/.
- nature-kit: plant_bush.glb, plant_bushSmall.glb, mushroom_tanGroup.glb.
  Source: assets/source/kenney/nature-kit/Models/GLTF format/. These models use
  material colours, without an external palette texture.

The goose, its animation, battery, flashlight, bandstand, paths, leaf scatter,
beam cone and soft light/shadow textures are built in code. No graves, crypts or
coffins are used. Static props merge into palette batches; kid animations use the
supplied idle/sprint clips and preserve the source skeleton.


Phase5 additions use generated128x128 ground grain,128x64 puff/feather atlas,
static contact-shadow planes and pooled simple-shape effects. Kid holding-right
is blended on the right arm while lit. The audio bank/source licences and all
synthetic substitutes are listed in game/SOUND_CHOICES.md (27 MP3 files).

Phase6 Cul-de-sac uses these same supplied props, with simple-shape houses,
windows, parked cars, oval green and circular pond. No additional model files.
Unused prior hide-and-seek assets are retained under legacy/hideandseek-public
for their unchanged compatibility tests and are absent from the active public tree.
