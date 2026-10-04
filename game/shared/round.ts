import { HOUSE_X, insideStreet, type StreetPoint } from './street-layout.js';
export const HIDING_MS = 25_000;
export const SEEKING_MS = 120_000;
export const REVEAL_MS = 5_000;
export const SEARCH_MS = 2_000;
export const COOLDOWN_MS = 5_000;
export const ACTION_RANGE = 1.3;
export const PREP_BOUNDS = { minX: -5, maxX: 5, minZ: -3.5, maxZ: 3.5 } as const;
export const FLASHLIGHT_PICKUP = { x: 0, z: -2 } as const;
export type HidingSpot = StreetPoint & { id: string; name: string; kind: 'mailbox' | 'hedge' | 'porch' | 'bin'; objectX: number; objectZ: number };
export const HIDING_SPOTS: readonly HidingSpot[] = HOUSE_X.flatMap((x, i) => [
  { id: `mailbox-${i}`, name: 'Mailbox', kind: 'mailbox' as const, x: x - 1.8, z: -6.55, objectX: x - 1.8, objectZ: -7.4 },
  { id: `hedge-${i}`, name: 'Hedge', kind: 'hedge' as const, x: x + 3.4, z: -7.55, objectX: x + 3.4, objectZ: -8.7 },
  { id: `porch-${i}`, name: 'Porch corner', kind: 'porch' as const, x: x - 3, z: -9.55, objectX: x - 3, objectZ: -10.0 },
  { id: `bin-${i}`, name: 'Bin', kind: 'bin' as const, x: x + 4.1, z: -5.9, objectX: x + 4.1, objectZ: -6.8 },
]);
if (HIDING_SPOTS.some(spot => !insideStreet(spot.x, spot.z))) throw new Error('An authored hiding socket is blocked');
export function insidePrep(x: number, z: number): boolean { return Number.isFinite(x) && Number.isFinite(z) && x >= PREP_BOUNDS.minX && x <= PREP_BOUNDS.maxX && z >= PREP_BOUNDS.minZ && z <= PREP_BOUNDS.maxZ; }
export function nearSpot(point: StreetPoint, spot: StreetPoint): boolean { return Math.hypot(point.x - spot.x, point.z - spot.z) <= ACTION_RANGE; }
