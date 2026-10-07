export const TUNE = {
  kidSpeed: 5, litSpeed: 4.25, gooseSpeed: 5.5, botSpeed: 5.25,
  range: 9, halfCone: Math.PI / 9, aimSpeed: Math.PI * 5 / 3,
  dwell: .25, freeze: 1, immunity: 4, drain: 20, freezeCost: 25,
  recharge: 4, rechargeDelay: 2, minimumBattery: 10,
  windup: .12, dashTime: .22, dashDistance: 3.2, recovery: .5, cooldown: 2.5,
  catchRadius: .85, lungeRadius: 1, roundSeconds: 75,
  soloFirstSpawn: 1.5, soloHour: 30, soloRetryReady: 1.8, soloAutoRetry: 4,
} as const;
export const SOLO_SPAWNS = [1.5,10,20,32,45,60,75,90,105,120] as const;
export function tonightSeed(time=Date.now()){return Number(new Date(time).toISOString().slice(0,10).replaceAll('-',''));}
export type Point = { x: number; z: number };
export type Solid = { x: number; z: number; w: number; d: number; blocksLight: boolean };
export const PARK = {
  width: 26, depth: 18,
  solids: [
    { x: 0, z: 0, w: 5.8, d: 5.8, blocksLight: true },
    { x: -7, z: -3.5, w: 5, d: 1, blocksLight: true },
    { x: 7, z: 3.5, w: 5, d: 1, blocksLight: true },
    { x: -6, z: 4, w: 1, d: 4, blocksLight: true },
    { x: 6, z: -4, w: 1, d: 4, blocksLight: true },
  ] as Solid[],
  pads: [{x:-10,z:-6},{x:10,z:6},{x:-3,z:7},{x:3,z:-7},{x:-10,z:2},{x:10,z:-2},{x:-6,z:-7},{x:6,z:7}],
};
export type Arena = typeof PARK;
export function distance(a: Point, b: Point) { return Math.hypot(a.x-b.x,a.z-b.z); }
export function angle(a: Point,b: Point) { return Math.atan2(b.x-a.x,b.z-a.z); }
export function angleDelta(a:number,b:number) { return Math.atan2(Math.sin(b-a),Math.cos(b-a)); }
export function walkable(p:Point, arena:Arena=PARK, radius=.4) {
  return Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x)<=arena.width/2-radius && Math.abs(p.z)<=arena.depth/2-radius &&
    !arena.solids.some(s=>Math.abs(p.x-s.x)<s.w/2+radius && Math.abs(p.z-s.z)<s.d/2+radius);
}
export function clearPath(a:Point,b:Point, arena:Arena=PARK, radius=.4, light=false) {
  if(!light && (!walkable(a,arena,radius)||!walkable(b,arena,radius)))return false;
  for(const s of arena.solids){
    if(light&&!s.blocksLight)continue;
    let lo=0,hi=1;
    for(const axis of ['x','z'] as const){
      const half=(axis==='x'?s.w:s.d)/2+radius, delta=b[axis]-a[axis];
      if(Math.abs(delta)<1e-9){if(Math.abs(a[axis]-s[axis])>=half){lo=2;break;}}
      else {let t1=(s[axis]-half-a[axis])/delta,t2=(s[axis]+half-a[axis])/delta;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);}
    }
    if(lo<=hi&&lo<=1&&hi>=0)return false;
  }
  return true;
}
export function slide(p:Point,dx:number,dz:number,arena:Arena=PARK):Point {
  const target={x:p.x+dx,z:p.z+dz};
  if(clearPath(p,target,arena))return target;
  const x={x:p.x+dx,z:p.z};if(clearPath(p,x,arena))return x;
  const z={x:p.x,z:p.z+dz};return clearPath(p,z,arena)?z:{x:p.x,z:p.z};
}
export type Role='kid'|'goose';
export interface Entity extends Point {
  id:string; name:string; role:Role; bot:boolean; personality:number; facing:number; aim:number;
  battery:number; light:boolean; held:boolean; lastLight:number; frozenUntil:number; immuneUntil:number;
  safeUntil:number; score:number; vx:number; vz:number; lungeAt:number; lungeAngle:number;
  lungeHit:boolean; dwell:Record<string,number>; touch:Record<string,number>;
}
export type ChaseEvent = {id:number; at:number; type:'freeze'|'thaw'|'windup'|'miss'|'near'|'catch'|'pickup'|'dawn'|'flock'|'spawn'|'hour'; actor:string; target?:string; x:number; z:number};
export interface SoloState {
  runId:string; day:number; hour:number; flock:number; nextSpawnAt:number|null; intensity:number;
  resultAt:number|null; retryReadyAt:number|null; autoRetryAt:number|null;
}
export interface ChaseSnapshot {
  code:string; now:number; elapsed:number; mode:'solo'|'multi'; phase:'playing'|'results';
  entities:Entity[]; pickups:{x:number;z:number;readyAt:number}[]; events:ChaseEvent[]; firstCatch:number|null;
  solo?:SoloState;
}
