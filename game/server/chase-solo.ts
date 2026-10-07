import { randomUUID } from 'node:crypto';
import { SOLO_SPAWNS, TUNE, clearPath, distance, walkable, type Point, type SoloState } from '../shared/chase.js';
import { ChaseSimulation,randomSeed } from './chase-simulation.js';

const names=['Chaser','Cutter','Pincer','Lurker'];
/** Owns the solo schedule; the renderer and balance runner use this same director. */
export class SoloDirector {
  readonly runId=randomUUID(); hour=0; spawned=0; intensity=0;
  private eventSeen=0; private batteryLow=false; private quietSince=0; private delayedSpawn=-1;
  private nextSpawn=SOLO_SPAWNS[0] as number; private resultAt:number|null=null;
  constructor(readonly day:number,readonly kidId:string,readonly beginner:boolean){ }
  prepare(sim:ChaseSimulation){
    sim.autoLightUntil=1;sim.beginner=this.beginner;
    const rand=randomSeed(this.day),pads=[...sim.arena.pads];
    for(let i=pads.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[pads[i],pads[j]]=[pads[j],pads[i]];}
    // An inviting pickup in the open teaches movement before the first goose arrives.
    sim.pickups=[{x:-3,z:3.8,readyAt:0},{...pads[0],readyAt:0}];
  }
  update(sim:ChaseSimulation,dt:number){
    const kid=sim.entities.find(e=>e.id===this.kidId);if(!kid)return;
    if(sim.phase==='results'){this.resultAt??=sim.now;return;}
    this.intensity=Math.max(0,this.intensity-dt*.5);
    for(const event of sim.events){if(event.id<=this.eventSeen)continue;this.eventSeen=event.id;if(event.type==='freeze')this.intensity+=2;if(event.type==='near')this.intensity+=1;}
    if(kid.battery<20&&!this.batteryLow)this.intensity+=3;this.batteryLow=kid.battery<20;
    sim.soloIntensity=this.intensity;
    if(this.intensity>0)this.quietSince=sim.elapsed;
    if(this.spawned<SOLO_SPAWNS.length){
      if(this.intensity>6&&this.spawned>0&&this.delayedSpawn!==this.spawned&&sim.elapsed>=this.nextSpawn-1){this.nextSpawn+=4;this.delayedSpawn=this.spawned;}
      const early=this.spawned>0&&sim.elapsed-this.quietSince>=6?2:0;
      if(sim.elapsed>=this.nextSpawn-early){
        const n=this.spawned,points:Point[]=[{x:12,z:7.3},{x:-12,z:-7},{x:12,z:-7},{x:-12,z:7.3},{x:0,z:-8},{x:0,z:8}];
        let spawn:Point;
        if(n===0)spawn={x:9,z:7.3};
        else {
          const offset=(this.day+n)%points.length;
          const choices=points.map((_,i)=>points[(offset+i)%points.length]).filter(p=>walkable(p,sim.arena));
          spawn=choices.find(p=>distance(p,kid)>=12&&!clearPath(p,kid,sim.arena,0,true))??choices.reduce((a,b)=>distance(a,kid)>distance(b,kid)?a:b);
        }
        const goose=sim.add(`solo-goose-${n}`,names[n%4],true,'goose',spawn);goose.personality=n%4;
        if(n===0){sim.firstSoloGooseId=goose.id;goose.facing=-Math.PI/2;}
        sim.event('spawn',goose);this.spawned++;this.nextSpawn=SOLO_SPAWNS[this.spawned]??Infinity;
      }
    }
    const hour=Math.floor(sim.elapsed/TUNE.soloHour);
    if(hour>this.hour){this.hour=hour;kid.battery=100;sim.survivalMultiplier=1+hour;for(const goose of sim.entities)if(goose.role==='goose')goose.frozenUntil=Math.max(goose.frozenUntil,sim.now+1.5);sim.event('hour',kid);}
  }
  snapshot():SoloState{return {runId:this.runId,day:this.day,hour:this.hour,flock:this.spawned,nextSpawnAt:Number.isFinite(this.nextSpawn)?this.nextSpawn:null,intensity:this.intensity,resultAt:this.resultAt,retryReadyAt:this.resultAt===null?null:this.resultAt+TUNE.soloRetryReady,autoRetryAt:this.resultAt===null?null:this.resultAt+TUNE.soloAutoRetry};}
}
