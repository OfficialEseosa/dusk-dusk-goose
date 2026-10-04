/** Shared street placements and collision dimensions in metres. */
export const STREET_BOUNDS = { minX: -36, maxX: 36, minZ: -19, maxZ: 7 } as const;
export const MOVE_SPEED = 4;
export const BLACKOUT_DELAY_MS = 10_000;
/** World-space beam profile, shared by every player; camera size never changes it. */
export const FLASHLIGHT_PROFILE={color:0xff9d38,intensity:9,range:12.5,halfAngle:0.40,penumbra:0.55,height:1.1,forwardOffset:0.4,targetDistance:9,targetY:-0.45,maxShadowLights:2} as const;
export const PLAYER_RADIUS = 0.3;
export const HOUSE_X = [-30, -18, -6, 6, 18, 30] as const;
export const HOUSE_MODELS = ["b", "a", "d", "c", "f", "e"] as const;
const HOUSE_DEPTHS = [5.30, 6.72, 4.98, 6.79, 8.37, 6.72] as const;
export const LAMP_X = [-29, -9, 11, 31] as const;
export const HOUSE_Z = -14.2;
export type StreetPoint = { x: number; z: number };
export type StreetSolid = { id: string; kind: "house" | "car" | "planter" | "tree" | "lamp" | "mailbox"; minX: number; maxX: number; minZ: number; maxZ: number };
const box = (id: string, kind: StreetSolid["kind"], x: number, z: number, width: number, depth: number): StreetSolid => ({
  id, kind, minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2,
});
/** Ground-level bodies only; tree crowns and lamp overhangs are not solid. */
export const SOLIDS: readonly StreetSolid[] = [
  ...HOUSE_X.flatMap((x, index) => [
    box(`house-${index}`, "house", x, HOUSE_Z, 8.5, HOUSE_DEPTHS[index]),
    box(`planter-${index}`, "planter", x + 3.4, -8.7, 1.2, 0.9),
    box(`tree-${index}`, "tree", x + 4.7, -12.4, 0.68, 0.68),
    box(`mailbox-${index}`, "mailbox", x - 1.8, -7.4, 0.45, 0.4),
  ]),
  box("sedan", "car", -17, -0.8, 4.25, 2.5),
  box("van", "car", 19, -0.8, 4.4, 2.4),
  ...LAMP_X.map((x, index) => box(`lamp-${index}`, "lamp", x, -3.9, 0.30, 0.30)),
];
const epsilon = 0.00001;
function expanded(solid: StreetSolid) {
  return { minX: solid.minX - PLAYER_RADIUS + epsilon, maxX: solid.maxX + PLAYER_RADIUS - epsilon,
    minZ: solid.minZ - PLAYER_RADIUS + epsilon, maxZ: solid.maxZ + PLAYER_RADIUS - epsilon };
}
const WALK_BOUNDS=SOLIDS.map(expanded);
const BOUNDS_BY_SOLID=new Map(SOLIDS.map((solid,index)=>[solid,WALK_BOUNDS[index]]));
export function insideStreet(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) &&
    x >= STREET_BOUNDS.minX && x <= STREET_BOUNDS.maxX &&
    z >= STREET_BOUNDS.minZ && z <= STREET_BOUNDS.maxZ &&
    !WALK_BOUNDS.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
}
function crossesSolid(from: StreetPoint, to: StreetPoint, solid: StreetSolid): boolean {
  const bounds = BOUNDS_BY_SOLID.get(solid)!;
  let enter = 0, exit = 1;
  for (const [start, delta, minimum, maximum] of [
    [from.x, to.x - from.x, bounds.minX, bounds.maxX],
    [from.z, to.z - from.z, bounds.minZ, bounds.maxZ],
  ]) {
    if (Math.abs(delta) < epsilon) { if (start <= minimum || start >= maximum) return false; continue; }
    const first = (minimum - start) / delta, second = (maximum - start) / delta;
    enter = Math.max(enter, Math.min(first, second)); exit = Math.min(exit, Math.max(first, second));
    if (enter >= exit) return false;
  }
  return enter < exit;
}
/** A clear endpoint is insufficient: the entire reported segment must be clear. */
export function legalStreetMove(from: StreetPoint, to: StreetPoint): boolean {
  return insideStreet(from.x, from.z) && insideStreet(to.x, to.z) && !SOLIDS.some(solid => crossesSolid(from, to, solid));
}
/** Device movement slides along solid faces without simulating movement on the server. */
export function moveOnStreet(from: StreetPoint, to: StreetPoint, visited?: (point: StreetPoint) => void): StreetPoint {
  const target = { x: Math.max(STREET_BOUNDS.minX, Math.min(STREET_BOUNDS.maxX, to.x)),
    z: Math.max(STREET_BOUNDS.minZ, Math.min(STREET_BOUNDS.maxZ, to.z)) };
  const steps = Math.max(1, Math.ceil(Math.hypot(target.x - from.x, target.z - from.z) / 0.08));
  const dx = (target.x - from.x) / steps, dz = (target.z - from.z) / steps;
  let point = { ...from };
  for (let step = 0; step < steps; step++) {
    const next = { x: Math.max(STREET_BOUNDS.minX, Math.min(STREET_BOUNDS.maxX, point.x + dx)),
      z: Math.max(STREET_BOUNDS.minZ, Math.min(STREET_BOUNDS.maxZ, point.z + dz)) };
    if (legalStreetMove(point, next)) { point = next; visited?.({ ...point }); continue; }
    const across = { x: next.x, z: point.z };
    if (legalStreetMove(point, across)) { point = across; visited?.({ ...point }); }
    const along = { x: point.x, z: next.z };
    if (legalStreetMove(point, along)) { point = along; visited?.({ ...point }); }
  }
  return point;
}
