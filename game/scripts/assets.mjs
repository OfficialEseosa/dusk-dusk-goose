import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(gameRoot, '../assets/source/kenney');
const outputRoot = resolve(gameRoot, 'public/assets/kenney');
const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
const packs = [
  { id: 'city-kit-suburban', folder: 'GLB format', url: 'https://kenney.nl/assets/city-kit-suburban', models: [...letters.map(x => `building-type-${x}`), 'driveway-short', 'fence', 'fence-low', 'path-short', 'path-stones-short', 'planter', 'tree-small', 'tree-large'], textures: ['Textures/colormap.png'] },
  { id: 'furniture-kit', folder: 'GLTF format', url: 'https://kenney.nl/assets/furniture-kit', models: ['bedSingle', 'cabinetBedDrawerTable', 'books', 'radio', 'rugRectangle', 'trashcan', 'cardboardBoxClosed', 'wall', 'wallCorner', 'wallDoorway', 'wallWindow', 'floorFull'], textures: [] },
  { id: 'car-kit', folder: 'GLB format', url: 'https://kenney.nl/assets/car-kit', models: ['sedan', 'van', 'box', 'wheel-default'], textures: ['Textures/colormap.png'] },
  { id: 'blocky-characters', folder: 'GLB format', url: 'https://kenney.nl/assets/blocky-characters', models: letters.map(x => `character-${x}`), textures: letters.map(x => `Textures/texture-${x}.png`) },
  { id: 'city-kit-roads', folder: 'GLB format', url: 'https://kenney.nl/assets/city-kit-roads', models: ['road-straight', 'road-end', 'road-bend', 'road-driveway-single', 'light-curved', 'dumpster', 'electricity-pole'], textures: ['Textures/colormap.png'] },
];

function parseGlb(bytes, name) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid GLB v2: ${name}`);
  const length = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || 20 + length > bytes.length) throw new Error(`Missing GLB JSON: ${name}`);
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8').trim());
}

function metadata(gltf) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    const accessor = gltf.accessors?.[primitive.attributes?.POSITION];
    if (accessor?.min && accessor?.max) for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], accessor.min[i]);
      max[i] = Math.max(max[i], accessor.max[i]);
    }
    const count = (gltf.accessors?.[primitive.indices] ?? accessor)?.count ?? 0;
    const mode = primitive.mode ?? 4;
    if (mode === 4) triangles += count / 3;
    else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
  }
  return {
    geometryBounds: Number.isFinite(min[0]) ? { space: 'mesh-local accessor union; not transformed scene bounds', min, max } : null,
    triangles: Math.round(triangles),
    animationClips: (gltf.animations ?? []).map((animation, i) => animation.name ?? `animation-${i}`),
    hasSkin: (gltf.skins?.length ?? 0) > 0,
    materialCount: gltf.materials?.length ?? 0,
    scale: { unitsPerMetre: null, status: 'verify scene dimensions during step 2' },
    collision: { status: 'authored gameplay collider required in step 2; never infer from decorative mesh' },
  };
}

function dependencyPath(uri, modelDir) {
  if (uri.startsWith('data:')) return null;
  if (/^[a-z]+:/i.test(uri) || uri.startsWith('/') || uri.includes('\\')) throw new Error(`Unsupported external model URI: ${uri}`);
  const dependency = resolve(modelDir, decodeURIComponent(uri));
  const within = relative(modelDir, dependency);
  if (within.startsWith('..') || within.startsWith(sep)) throw new Error(`Dependency escapes model directory: ${uri}`);
  return { source: dependency, name: within.split(sep).join('/') };
}

// Validate the whole selection before writing. A mismatch fails loudly, never
// substitutes a similarly named model, and never modifies the supplied originals.
const validated = [];
for (const pack of packs) {
  const packRoot = resolve(sourceRoot, pack.id);
  const modelDir = resolve(packRoot, 'Models', pack.folder);
  const licensePath = resolve(packRoot, 'License.txt');
  const license = await readFile(licensePath, 'utf8').catch(() => { throw new Error(`Missing exact supplied file: ${licensePath}`); });
  if (!/Creative Commons Zero|CC0/i.test(license)) throw new Error(`Expected CC0 licence not found: ${licensePath}`);
  const entries = [];
  const dependencies = new Map(pack.textures.map(name => [name, resolve(modelDir, name)]));
  for (const name of pack.models) {
    const source = resolve(modelDir, `${name}.glb`);
    const bytes = await readFile(source).catch(() => { throw new Error(`Missing exact supplied file: ${source}. Do not rename source files.`); });
    const gltf = parseGlb(bytes, source);
    for (const item of [...(gltf.images ?? []), ...(gltf.buffers ?? [])]) if (item.uri) {
      const dependency = dependencyPath(item.uri, modelDir);
      if (dependency) dependencies.set(dependency.name, dependency.source);
    }
    entries.push({ file: `${name}.glb`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), source: relative(resolve(gameRoot, '..'), source).split(sep).join('/'), ...metadata(gltf) });
  }
  for (const source of dependencies.values()) await stat(source).catch(() => { throw new Error(`Missing exact model dependency: ${source}`); });
  validated.push({ pack, modelDir, licensePath, entries, dependencies });
}

const manifest = { schemaVersion: 1, policy: 'Selected original files only; names preserved; no model optimization or asset substitution performed.', packs: [], totals: { models: 0, triangles: 0, bytes: 0 } };
for (const { pack, modelDir, licensePath, entries, dependencies } of validated) {
  const target = resolve(outputRoot, pack.id);
  await mkdir(target, { recursive: true });
  await copyFile(licensePath, resolve(target, 'License.txt'));
  for (const entry of entries) await copyFile(resolve(modelDir, entry.file), resolve(target, entry.file));
  const textures = [];
  for (const [name, source] of dependencies) {
    await mkdir(dirname(resolve(target, name)), { recursive: true });
    await copyFile(source, resolve(target, name));
    const bytes = await readFile(source);
    textures.push({ file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  manifest.packs.push({ id: pack.id, author: 'Kenney', license: 'CC0-1.0', licenseFile: `/assets/kenney/${pack.id}/License.txt`, officialPage: pack.url, sourceModelFolder: `Models/${pack.folder}`, runtimeBase: `/assets/kenney/${pack.id}/`, models: entries, textures });
  manifest.totals.models += entries.length;
  manifest.totals.triangles += entries.reduce((sum, model) => sum + model.triangles, 0);
  manifest.totals.bytes += entries.reduce((sum, model) => sum + model.bytes, 0) + textures.reduce((sum, texture) => sum + texture.bytes, 0);
}
await mkdir(resolve(gameRoot, 'public/assets'), { recursive: true });
await writeFile(resolve(gameRoot, 'public/assets/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Asset intake verified ${manifest.totals.models} exact models from ${packs.length} CC0 packs (${(manifest.totals.bytes / 1024 / 1024).toFixed(2)} MiB selected assets). Supplied filenames preserved.`);
