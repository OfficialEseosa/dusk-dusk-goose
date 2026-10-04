/** Shared dimensions in metres; houses and foliage sit outside this walking area. */
export const STREET_BOUNDS = { minX: -36, maxX: 36, minZ: -9, maxZ: 7 } as const;
export const MOVE_SPEED = 4;
export const BLACKOUT_DELAY_MS = 10_000;
export function insideStreet(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) &&
    x >= STREET_BOUNDS.minX && x <= STREET_BOUNDS.maxX &&
    z >= STREET_BOUNDS.minZ && z <= STREET_BOUNDS.maxZ;
}
