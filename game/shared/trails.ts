import { FLASHLIGHT_PROFILE as BEAM, insideStreet, legalStreetMove, HOUSE_X, SOLIDS, type StreetPoint } from './street-layout.js';
import { HIDING_SPOTS, type HidingSpot } from './round.js';
export const FOOTPRINT_LIFE_MS = 60_000;
export const MAX_FOOTPRINTS = 256;
export const FOOTPRINT_SPACING = .45;
export const FREEZE_MS = 2_000;
export const FREEZE_IMMUNITY_MS = 5_000;
export const CLUE_INTERVAL_MS = 30_000;
export const CLUE_CHOICE_MS = 5_000;
/** The physical spotlight cone, evaluated in world metres, never screen pixels. */
export function groundBeamStrength(point: StreetPoint, pose: StreetPoint & { facing: number }, groundY = 0): number {
  const dx = Math.sin(pose.facing), dz = Math.cos(pose.facing);
  const vx = point.x - pose.x - dx * BEAM.forwardOffset, vy = groundY - BEAM.height, vz = point.z - pose.z - dz * BEAM.forwardOffset;
  const distance = Math.hypot(vx, vy, vz);
  if (!distance || distance >= BEAM.range) return 0;
  const pitch = Math.atan2(BEAM.height - BEAM.targetY, BEAM.targetDistance);
  const cosine = (vx * dx * Math.cos(pitch) - vy * Math.sin(pitch) + vz * dz * Math.cos(pitch)) / distance;
  const outer = Math.cos(BEAM.halfAngle), inner = Math.cos(BEAM.halfAngle * (1 - BEAM.penumbra));
  const t = Math.max(0, Math.min(1, (cosine - outer) / (inner - outer)));
  return t * t * (3 - 2 * t);
}
export type TrueClue = { id: string; text: string; candidates: string[] };
/** Every possible offered clue retains both same-kind spots in an adjacent house pair. */
export function trueCluePool(spot: HidingSpot): TrueClue[] {
  const index = Math.floor(HIDING_SPOTS.indexOf(spot) / 4), pair = Math.floor(index / 2);
  const predicates: { id: string; text: string; match: (candidate: HidingSpot, index: number) => boolean }[] = [
    { id: 'half', text: spot.x < 0 ? 'It is on the left half of the street.' : 'It is on the right half of the street.', match: candidate => (candidate.x < 0) === (spot.x < 0) },
    { id: 'pair', text: ['Look around the two houses at the left end.', 'Look around the two middle houses.', 'Look around the two houses at the right end.'][pair], match: (_, i) => Math.floor(i / 8) === pair },
    ...(['mailbox', 'hedge', 'porch', 'bin'] as const).filter(kind => kind !== spot.kind).map(kind => ({ id: 'not-' + kind, text: `It is not ${kind === 'porch' ? 'at a porch corner' : kind === 'hedge' ? 'under a hedge' : kind === 'bin' ? 'by a bin' : 'by a mailbox'}.`, match: (candidate: HidingSpot) => candidate.kind !== kind })),
  ];
  // The middle pair straddles the street halves. Omit half there, preserving two possibilities.
  return predicates.filter(clue => clue.id !== 'half' || pair !== 1).map(clue => ({ id: clue.id, text: clue.text, candidates: HIDING_SPOTS.filter(clue.match).map(candidate => candidate.id) }));
}
/** A bounded half-metre path search keeps both computer trails on walkable ground. */
export function streetRoute(from: StreetPoint, to: StreetPoint): StreetPoint[] {
  const step = .5, key = (x: number, z: number) => `${x},${z}`;
  const sx = Math.round(from.x / step), sz = Math.round(from.z / step), tx = Math.round(to.x / step), tz = Math.round(to.z / step);
  const start = key(sx, sz), queue = [[sx, sz]], parents = new Map<string, string | null>([[start, null]]);
  let end: string | undefined;
  for (let i = 0; i < queue.length && i < 10_000; i++) {
    const [x, z] = queue[i], point = { x: x * step, z: z * step };
    if (Math.hypot(point.x - to.x, point.z - to.z) <= .75 && legalStreetMove(point, to)) { end = key(x, z); break; }
    for (const [ox, oz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + ox, nz = z + oz, next = key(nx, nz);
      if (parents.has(next) || !insideStreet(nx * step, nz * step) || !legalStreetMove(point, { x: nx * step, z: nz * step })) continue;
      parents.set(next, key(x, z)); queue.push([nx, nz]);
    }
  }
  if (!end) return [];
  const path: StreetPoint[] = [{x:to.x,z:to.z}];
  for (let current: string | null = end; current; current = parents.get(current) ?? null) { const [x,z] = current.split(',').map(Number); path.push({x:x*step,z:z*step}); }
  path.reverse(); path[0] = from;
  return path;
}

/** Top surfaces of the authored road, paving, lawns and porch landings. */
export function groundHeight(x:number,z:number) {
  if(z>=-3.5&&z<=8.5)return -.055;
  if(z>=-6.65&&z<-3.5)return .02;
  for(let i=0;i<HOUSE_X.length;i++) {
    const house=HOUSE_X[i],front=SOLIDS.find(s=>s.id===`house-${i}`)!.maxZ;
    if(Math.abs(x-(house-3))<=.8&&z>=front&&z<=-9.8)return .115;
    if(Math.abs(x-(house+1.9))<=.6&&z>=-10.95&&z<=-5.45)return .045;
    if(Math.abs(x-house)<=5.7&&z>=-19.4&&z<=-6.4)return -.025;
  }
  return -.175;
}
