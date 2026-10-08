import { PARK,TUNE,angle,angleDelta,clearPath,distance,slide,walkable,type Entity,type Point,type ChaseEvent,type ChaseSnapshot,type Arena,type LampState } from '../shared/chase.js';
import {PositionHistory,segmentDistance} from './chase-history.js';

/** Deterministic generator: identical simulation inputs yield identical reports. */
export function randomSeed(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
export class ChaseSimulation {
  entities:Entity[]=[]; events:ChaseEvent[]=[]; pickups:{x:number;z:number;readyAt:number}[]=[];
  now=0; elapsed=0; phase:'playing'|'results'='playing'; firstCatch:number|null=null;
  survivalMultiplier=1; autoLightUntil=0; firstSoloGooseId?:string; beginner=false; assistedFreezeUsed=false; soloIntensity=0;
  startingGeese=new Set<string>();lastKid?:string;private startingBonus=new Set<string>();
  history=new PositionHistory();viewDelay=new Map<string,number>();
  lamps:LampState[]=[{x:-3.8,z:0,remaining:5,readyAt:0,active:false}];beginnerKids=new Set<string>();private lastCatchAt=0;
  private minds=new Map<string,{lastSeen?:Point; seenAt:number; litAt:number; cornerUntil:number;waitAt:number;nextAmbush:number}>();
  private eventId=0; private rng:()=>number; private navCache=new Map<string,{at:number;field:Map<string,number>}>();
  constructor(public mode:'solo'|'multi'='solo',seed=1,public arena:Arena=PARK){
    this.rng=randomSeed(seed);this.pickups=arena.pads.slice(0,arena===PARK?2:3).map(p=>({...p,readyAt:0}));
    if(arena!==PARK)this.lamps=[{x:0,z:-3,remaining:5,readyAt:0,active:false},{x:-6,z:0,remaining:5,readyAt:0,active:false},{x:6,z:0,remaining:5,readyAt:0,active:false}];
  }
  add(id:string,name:string,bot=false,role:'kid'|'goose'='kid',position?:Point){
    const n=this.entities.length;let p=position??(role==='kid'?{x:-3-(n%4)*1.8,z:7.3}:{x:10,z:-6});
    if(!walkable(p,this.arena))p=this.arena.pads.find(q=>walkable(q,this.arena)&&this.entities.every(e=>distance(e,q)>1.3))??{x:10,z:7};
    const e:Entity={...p,id,name,bot,role,personality:n%4,facing:Math.PI,aim:Math.PI,battery:100,light:false,held:false,lastLight:0,frozenUntil:0,immuneUntil:0,safeUntil:role==='goose'?this.now+1.5:0,score:0,vx:0,vz:0,lungeAt:-100,lungeAngle:0,lungeHit:false,dwell:{},touch:{}};
    this.entities.push(e);return e;
  }
  event(type:ChaseEvent['type'],actor:Entity,target?:Entity){this.events.push({id:++this.eventId,at:this.now,type,actor:actor.id,target:target?.id,x:target?.x??actor.x,z:target?.z??actor.z});if(this.events.length>48)this.events.shift();}
  gooseBoost(){return this.mode==='multi'?(this.elapsed>=60?1.08:1)*(1+.04*Math.max(0,Math.min(4,Math.floor((this.elapsed-this.lastCatchAt-15)/5)))):1;}
  speed(e:Entity){if(e.frozenUntil>this.now||e.safeUntil>this.now&&e.role==='goose')return 0;
    const t=this.now-e.lungeAt;if(e.role==='goose'&&t<TUNE.windup+TUNE.dashTime+TUNE.recovery)return t<TUNE.windup?0:t<TUNE.windup+TUNE.dashTime?TUNE.dashDistance/TUNE.dashTime:TUNE.gooseSpeed*.3;
    if(e.role==='kid')return (e.light?TUNE.litSpeed:TUNE.kidSpeed)*(e.id===this.lastKid?1.08:1);
    return (this.mode==='solo'?TUNE.kidSpeed*Math.min(1.12,.92+.02*Math.floor(this.elapsed/15)):e.bot?TUNE.botSpeed:TUNE.gooseSpeed)*this.gooseBoost();
  }
  lunge(e:Entity){if(e.role!=='goose'||e.frozenUntil>this.now||e.safeUntil>this.now||this.now-e.lungeAt<TUNE.cooldown)return false;
    e.lungeAt=this.now;e.lungeAngle=e.facing;e.lungeHit=false;this.event('windup',e);return true;}
  dwellNeeded(goose:Entity,kid?:Entity){return this.mode==='solo'&&this.beginner&&!this.assistedFreezeUsed&&goose.id===this.firstSoloGooseId||this.mode==='multi'&&this.elapsed<=3&&!!kid&&this.beginnerKids.has(kid.id)? .1:TUNE.dwell;}
  practice(dt:number){
    this.now+=dt;
    for(const k of this.entities){if(k.role!=='kid')continue;k.battery=100;k.light=k.held;
      const target=this.entities.filter(g=>g.role==='goose'&&distance(k,g)<=TUNE.range&&clearPath(k,g,this.arena,0,true)).sort((a,b)=>distance(k,a)-distance(k,b))[0];
      const desired=target?angle(k,target):k.facing,delta=angleDelta(k.aim,desired);k.aim+=Math.max(-TUNE.aimSpeed*dt,Math.min(TUNE.aimSpeed*dt,delta));
      for(const g of this.entities){if(g.role!=='goose')continue;const hit=k.light&&distance(k,g)<=TUNE.range&&Math.abs(angleDelta(k.aim,angle(k,g)))<=TUNE.halfCone&&clearPath(k,g,this.arena,0,true);
        k.dwell[g.id]=hit?(k.dwell[g.id]??0)+dt:0;
        if(k.dwell[g.id]>=TUNE.dwell&&g.immuneUntil<=this.now&&g.frozenUntil<=this.now){g.frozenUntil=this.now+TUNE.freeze;g.immuneUntil=g.frozenUntil+TUNE.immunity;k.dwell[g.id]=0;this.event('freeze',k,g);}
      }
    }
  }
  private field(goal:Point){
    let gx=Math.round(goal.x),gz=Math.round(goal.z);
    if(!walkable({x:gx,z:gz},this.arena,.5)){
      let best=Infinity;
      for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const q={x:Math.round(goal.x)+dx,z:Math.round(goal.z)+dz},d=distance(q,goal);if(d<best&&walkable(q,this.arena,.5)){best=d;gx=q.x;gz=q.z;}}
    }
    const key=`${gx},${gz}`;
    const cached=this.navCache.get(key);if(cached&&this.now-cached.at<.25)return cached.field;
    const field=new Map<string,number>(),queue:Point[]=[{x:gx,z:gz}];field.set(key,0);
    for(let i=0;i<queue.length;i++){const p=queue[i],d=field.get(`${p.x},${p.z}`)!;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const q={x:p.x+dx,z:p.z+dz},k=`${q.x},${q.z}`;if(!field.has(k)&&walkable(q,this.arena,.5)){field.set(k,d+1);queue.push(q);}}
    }
    if(this.navCache.size>20)this.navCache.clear();this.navCache.set(key,{at:this.now,field});return field;
  }
  private steer(e:Entity,target:Point){
    if(clearPath(e,target,this.arena,.45))return angle(e,target);
    const field=this.field(target);let best=Infinity,chosen:Point=e;
    const ex=Math.round(e.x),ez=Math.round(e.z);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const q={x:ex+dx,z:ez+dz},cost=field.get(`${q.x},${q.z}`);const value=(cost??Infinity)+distance(e,q)*.15;if(distance(e,q)>.2&&value<best&&clearPath(e,q,this.arena)){chosen=q;best=value;}}
    return angle(e,chosen);
  }
  private bot(e:Entity,dt:number){
    let enemies=this.entities.filter(p=>p.role!==e.role);if(!enemies.length)return;
    let mind=this.minds.get(e.id);if(!mind){mind={seenAt:0,litAt:-100,cornerUntil:0,waitAt:-1,nextAmbush:0};this.minds.set(e.id,mind);}
    if(e.role==='goose')enemies=enemies.filter(k=>k.light||distance(e,k)<=12||clearPath(e,k,this.arena,0,true));
    if(!enemies.length){const target=mind.lastSeen&&this.now-mind.seenAt<4?mind.lastSeen:this.arena.pads[(e.personality+Math.floor(this.now/5))%this.arena.pads.length];const a=this.steer(e,target),q=slide(e,Math.sin(a)*this.speed(e)*dt,Math.cos(a)*this.speed(e)*dt,this.arena);e.vx=(q.x-e.x)/dt;e.vz=(q.z-e.z)/dt;e.facing=a;e.x=q.x;e.z=q.z;return;}
    let nearest=enemies[0];for(const p of enemies)if(distance(e,p)<distance(e,nearest))nearest=p;
    const d=distance(e,nearest);let direction=e.facing;
    if(e.role==='goose'){
      mind.lastSeen={x:nearest.x,z:nearest.z};mind.seenAt=this.now;
      let target:Point=nearest;
      if(e.personality===1)target={x:nearest.x+nearest.vx*.8,z:nearest.z+nearest.vz*.8};
      if(e.personality===2){const chaser=this.entities.find(g=>g.role==='goose'&&g.personality===0)??e;const lead={x:nearest.x+nearest.vx*.4,z:nearest.z+nearest.vz*.4};target={x:lead.x+Math.max(-4,Math.min(4,lead.x-chaser.x)),z:lead.z+Math.max(-4,Math.min(4,lead.z-chaser.z))};}
      if(e.personality===3&&d<8&&d>4&&this.now>=mind.nextAmbush){const pad=this.pickups.reduce((a,b)=>distance(a,nearest)<distance(b,nearest)?a:b);target=pad;if(distance(e,pad)<.5){if(mind.waitAt<0)mind.waitAt=this.now;if(this.now-mind.waitAt<2){e.vx=e.vz=0;return;}mind.nextAmbush=this.now+5;mind.waitAt=-1;target=nearest;}}else mind.waitAt=-1;
      if(this.mode==='solo'&&this.soloIntensity>6&&(e.personality===1||e.personality===3)&&d<6){target={x:e.x+(e.x-nearest.x)/d*2,z:e.z+(e.z-nearest.z)/d*2};}
      if(!walkable(target,this.arena))target=nearest;
      direction=this.steer(e,target);
      const inBeam=nearest.light&&Math.abs(angleDelta(nearest.aim,angle(nearest,e)))<Math.PI/6&&clearPath(e,nearest,this.arena,0,true);
      if(inBeam){if(mind.litAt<0)mind.litAt=this.now;if(this.now-mind.litAt>.3&&e.immuneUntil<=this.now)direction=angle(nearest,e)+(e.personality%2?1:-1)*Math.PI/2;}else mind.litAt=-100;
      if(Math.abs(angleDelta(e.facing,direction))>Math.PI/2)mind.cornerUntil=this.now+.3;
      const recent=this.entities.filter(g=>g!==e&&g.role==='goose'&&this.now-g.lungeAt<.5&&distance(g,nearest)<5).length;
      if(d<3.1&&recent<2&&Math.abs(angleDelta(e.facing,angle(e,nearest)))<.44&&this.rng()<dt*(this.mode==='solo'?3+Math.min(1,this.elapsed/90)*1.5:4.5))this.lunge(e);
    } else {
      // Choose a short, walkable escape ray. Clearance/look-ahead avoids hugging dead ends.
      let best=-Infinity;
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8,q={x:e.x+Math.sin(a)*2,z:e.z+Math.cos(a)*2};if(!clearPath(e,q,this.arena))continue;
        const clearance=Math.min(this.arena.width/2-Math.abs(q.x),this.arena.depth/2-Math.abs(q.z));
        const value=Math.min(...enemies.map(g=>distance(q,g)))+Math.min(2,clearance)*.35+Math.cos(a-e.facing)*.35;
        if(value>best){best=value;direction=a;}
      }
      // A kid releases as soon as defence lands; draining a beam into an immune goose is wasteful.
      e.held=d<6.5&&nearest.frozenUntil<=this.now&&nearest.immuneUntil<=this.now&&e.battery>26&&clearPath(e,nearest,this.arena,0,true);
      if(e.battery<40&&d>7){let pad=this.pickups.find(p=>p.readyAt<=this.now);if(pad)direction=this.steer(e,pad);}
    }
    // Keep computer teammates from running as one overlapping body.
    let sx=0,sz=0;for(const other of this.entities){if(other===e||other.role!==e.role)continue;const gap=distance(e,other);if(gap>=1.4)continue;const weight=(1.4-gap)/1.4,dx=(e.x-other.x)/(gap||1),dz=(e.z-other.z)/(gap||1);sx+=dx*weight;sz+=dz*weight;if(Math.abs(dx*Math.cos(direction)-dz*Math.sin(direction))<.3){const side=e.id<other.id?-1:1;sx+=Math.cos(direction)*side*weight*.7;sz-=Math.sin(direction)*side*weight*.7;}}
    if(sx||sz){const apart=Math.atan2(Math.sin(direction)+sx*.8,Math.cos(direction)+sz*.8);if(clearPath(e,{x:e.x+Math.sin(apart)*.6,z:e.z+Math.cos(apart)*.6},this.arena))direction=apart;}
    const t=this.now-e.lungeAt;if(e.role==='goose'&&t<TUNE.windup+TUNE.dashTime+TUNE.recovery)direction=e.lungeAngle;
    e.facing=direction;const speed=this.speed(e)*(e.role==='goose'&&mind.cornerUntil>this.now?.85:1),q=slide(e,Math.sin(direction)*speed*dt,Math.cos(direction)*speed*dt,this.arena);
    e.vx=(q.x-e.x)/dt;e.vz=(q.z-e.z)/dt;e.x=q.x;e.z=q.z;
  }
  step(dt=.05){
    if(this.phase==='results')return;const before=new Map(this.entities.map(e=>[e.id,{x:e.x,z:e.z}]));
    for(const e of this.entities)this.history.record(e.id,this.now,e);
    const previousTime=this.now;this.now+=dt;this.elapsed+=dt;
    // Only a completed beam/lamp freeze emits thaw; conversion safety is separate.
    for(const e of this.entities)if(e.role==='goose'&&e.frozenUntil>previousTime&&e.frozenUntil<=this.now&&e.immuneUntil>e.frozenUntil)this.event('thaw',e);
    for(const e of this.entities){if(e.bot)this.bot(e,dt);
      else if(e.role==='goose'&&this.now-e.lungeAt>=TUNE.windup&&this.now-e.lungeAt<TUNE.windup+TUNE.dashTime&&e.frozenUntil<=this.now){const q=slide(e,Math.sin(e.lungeAngle)*this.speed(e)*dt,Math.cos(e.lungeAngle)*this.speed(e)*dt,this.arena);e.x=q.x;e.z=q.z;}
    }
    // Capture all movement before resolving any player's defence or attack.
    for(const e of this.entities)this.history.record(e.id,this.now,e);
    for(const e of this.entities){if(e.role!=='kid')continue;
      e.light=(e.held||this.now<this.autoLightUntil)&&(e.light?e.battery>0:e.battery>=TUNE.minimumBattery);
      if(e.light){e.lastLight=this.now;e.battery=Math.max(0,e.battery-TUNE.drain*dt);}else if(this.now-e.lastLight>=TUNE.rechargeDelay&&!(this.mode==='multi'&&this.elapsed>=60))e.battery=Math.min(100,e.battery+TUNE.recharge*dt);
      e.score+=10*dt*this.survivalMultiplier*(e.id===this.lastKid?2:1);
      let target:Entity|undefined;
      const beamPoint=(g:Entity)=>this.history.at(g.id,this.now-Math.min(.2,Math.max(0,this.viewDelay.get(e.id)??0)),g);
      if(e.light)for(const g of this.entities)if(g.role==='goose'&&distance(e,beamPoint(g))<=TUNE.range&&clearPath(e,beamPoint(g),this.arena,0,true)&&(!target||distance(e,beamPoint(g))<distance(e,beamPoint(target))))target=g;
      const desired=target?angle(e,beamPoint(target)):e.facing,delta=angleDelta(e.aim,desired);e.aim+=Math.max(-TUNE.aimSpeed*dt,Math.min(TUNE.aimSpeed*dt,delta));
      // Resolve defence before any catches: completed freeze always wins a simultaneous touch.
      for(const g of this.entities){if(g.role!=='goose')continue;
        const point=beamPoint(g),hit=e.light&&distance(e,point)<=TUNE.range&&Math.abs(angleDelta(e.aim,angle(e,point)))<=TUNE.halfCone&&clearPath(e,point,this.arena,0,true);
        e.dwell[g.id]=hit?(e.dwell[g.id]??0)+dt:0;
        if(e.dwell[g.id]>=this.dwellNeeded(g,e)&&g.immuneUntil<=this.now&&g.frozenUntil<=this.now&&e.battery>=TUNE.freezeCost){g.frozenUntil=this.now+TUNE.freeze;g.immuneUntil=g.frozenUntil+TUNE.immunity+(this.mode==='solo'?Math.max(0,Math.floor(this.elapsed/30)-4)*.5:0);e.battery-=TUNE.freezeCost;e.score+=25;e.dwell[g.id]=0;this.assistedFreezeUsed=true;this.event('freeze',e,g);}
      }
      for(const p of this.pickups)if(p.readyAt<=this.now&&distance(e,p)<.9){e.battery=Math.min(100,e.battery+50);e.score+=10;p.readyAt=this.now+8;this.event('pickup',e);const pads=[...this.arena.pads].sort((a,b)=>distance(b,e)-distance(a,e));p.x=pads[0].x;p.z=pads[0].z;}
    }
    for(const lamp of this.lamps){
      if(lamp.readyAt>0&&lamp.readyAt<=this.now){lamp.readyAt=0;lamp.remaining=5;}
      const occupant=this.entities.find(k=>k.role==='kid'&&distance(k,lamp)<3&&clearPath(k,lamp,this.arena,0,true));
      lamp.active=!!occupant&&lamp.readyAt<=this.now&&lamp.remaining>0;
      if(lamp.active){lamp.remaining=Math.max(0,lamp.remaining-dt);
        for(const g of this.entities)if(g.role==='goose'&&distance(g,lamp)<3&&clearPath(lamp,g,this.arena,0,true)&&g.immuneUntil<=this.now&&g.frozenUntil<=this.now){g.frozenUntil=this.now+TUNE.freeze;g.immuneUntil=g.frozenUntil+TUNE.immunity;occupant!.score+=25;this.event('freeze',occupant!,g);}
        if(lamp.remaining<=0){lamp.readyAt=this.now+20;lamp.active=false;}
      }
    }
    for(const g of this.entities){if(g.role!=='goose'||g.frozenUntil>this.now||g.safeUntil>this.now)continue;
      const t=this.now-g.lungeAt,lunging=t>=TUNE.windup&&t<TUNE.windup+TUNE.dashTime;
      for(const k of this.entities){if(k.role!=='kid'||k.safeUntil>this.now)continue;const d=distance(g,k);
        g.touch[k.id]=d<TUNE.catchRadius?(g.touch[k.id]??0)+1:0;
        const rewound=this.history.at(k.id,this.now-Math.min(.15,Math.max(0,this.viewDelay.get(g.id)??0)),k);
        const lungeHit=lunging&&segmentDistance(rewound,before.get(g.id)??g,g)<TUNE.lungeRadius&&clearPath(g,rewound,this.arena,0,true);
        if(g.touch[k.id]>=2||lungeHit){
          // A beam about to complete in the runner grace window also protects the kid.
          if(k.light&&k.battery>=TUNE.freezeCost&&(k.dwell[g.id]??0)>=this.dwellNeeded(g,k)-.05&&g.immuneUntil<=this.now)continue;
          k.role='goose';k.light=false;k.held=false;k.safeUntil=this.now+1.5;k.frozenUntil=this.now+.6;k.touch={};g.score+=300;
          if(this.startingGeese.has(g.id)&&!this.startingBonus.has(g.id)){g.score+=100;this.startingBonus.add(g.id);}
          g.lungeHit=true;this.lastCatchAt=this.elapsed;this.firstCatch??=this.elapsed;this.event('catch',g,k);
        }
      }
      if(t>=TUNE.windup+TUNE.dashTime&&t<TUNE.windup+TUNE.dashTime+dt&&!g.lungeHit){this.event('miss',g);for(const k of this.entities)if(k.role==='kid'&&distance(g,k)<1.6){k.score+=50;k.battery=Math.min(100,k.battery+10);this.event('near',g,k);}}
    }
    const kids=this.entities.filter(e=>e.role==='kid');
    if(this.mode==='multi'&&kids.length===1&&!this.lastKid){this.lastKid=kids[0].id;kids[0].battery=100;}
    if(!kids.length||this.mode==='multi'&&this.elapsed>=TUNE.roundSeconds){this.phase='results';for(const e of this.entities)e.score+=kids.length?e.role==='kid'?500:0:e.role==='goose'?250:0;this.event(kids.length?'dawn':'flock',this.entities[0]);}
  }
  snapshot(code=''):ChaseSnapshot{return {code,arena:this.arena===PARK?'park':'culdesac',now:this.now,elapsed:this.elapsed,mode:this.mode,phase:this.phase,entities:this.entities,pickups:this.pickups,events:this.events,firstCatch:this.firstCatch,lamps:this.lamps,gooseBoost:this.gooseBoost()};}
}
