import { PARK,TUNE,angle,angleDelta,clearPath,distance,slide,walkable,type Entity,type Point,type ChaseEvent,type ChaseSnapshot,type Arena } from '../shared/chase.js';

/** Deterministic generator: identical simulation inputs yield identical reports. */
export function randomSeed(seed:number){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};}
export class ChaseSimulation {
  entities:Entity[]=[]; events:ChaseEvent[]=[]; pickups:{x:number;z:number;readyAt:number}[]=[];
  now=0; elapsed=0; phase:'playing'|'results'='playing'; firstCatch:number|null=null;
  private eventId=0; private rng:()=>number; private navCache=new Map<string,{at:number;field:Map<string,number>}>();
  constructor(public mode:'solo'|'multi'='solo',seed=1,public arena:Arena=PARK){
    this.rng=randomSeed(seed);this.pickups=arena.pads.slice(0,2).map(p=>({...p,readyAt:0}));
  }
  add(id:string,name:string,bot=false,role:'kid'|'goose'='kid',position?:Point){
    const n=this.entities.length;let p=position??(role==='kid'?{x:-3-(n%4)*1.8,z:7.3}:{x:10,z:-6});
    if(!walkable(p,this.arena))p=this.arena.pads.find(q=>walkable(q,this.arena)&&this.entities.every(e=>distance(e,q)>1.3))??{x:10,z:7};
    const e:Entity={...p,id,name,bot,role,personality:n%4,facing:Math.PI,aim:Math.PI,battery:100,light:false,held:false,lastLight:0,frozenUntil:0,immuneUntil:0,safeUntil:role==='goose'?this.now+1.5:0,score:0,vx:0,vz:0,lungeAt:-100,lungeAngle:0,lungeHit:false,dwell:{},touch:{}};
    this.entities.push(e);return e;
  }
  event(type:ChaseEvent['type'],actor:Entity,target?:Entity){this.events.push({id:++this.eventId,at:this.now,type,actor:actor.id,target:target?.id,x:target?.x??actor.x,z:target?.z??actor.z});if(this.events.length>48)this.events.shift();}
  speed(e:Entity){if(e.frozenUntil>this.now||e.safeUntil>this.now&&e.role==='goose')return 0;
    const t=this.now-e.lungeAt;if(e.role==='goose'&&t<TUNE.windup+TUNE.dashTime+TUNE.recovery)return t<TUNE.windup?0:t<TUNE.windup+TUNE.dashTime?TUNE.dashDistance/TUNE.dashTime:TUNE.gooseSpeed*.3;
    if(e.role==='kid')return e.light?TUNE.litSpeed:TUNE.kidSpeed;
    return (this.mode==='solo'?TUNE.kidSpeed*Math.min(1.12,.92+.02*Math.floor(this.elapsed/15)):e.bot?TUNE.botSpeed:TUNE.gooseSpeed)*(this.mode==='multi'&&this.elapsed>=60?1.08:1);
  }
  lunge(e:Entity){if(e.role!=='goose'||e.frozenUntil>this.now||e.safeUntil>this.now||this.now-e.lungeAt<TUNE.cooldown)return false;
    e.lungeAt=this.now;e.lungeAngle=e.facing;e.lungeHit=false;this.event('windup',e);return true;}
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
    const enemies=this.entities.filter(p=>p.role!==e.role);if(!enemies.length)return;
    let nearest=enemies[0];for(const p of enemies)if(distance(e,p)<distance(e,nearest))nearest=p;
    const d=distance(e,nearest);let direction=e.facing;
    if(e.role==='goose'){
      let target:Point=nearest;
      if(e.personality===1)target={x:nearest.x+nearest.vx*.65,z:nearest.z+nearest.vz*.65};
      if(e.personality===2)target={x:nearest.x+Math.sin(this.now*.5+e.personality)*2,z:nearest.z+Math.cos(this.now*.5)*2};
      if(!walkable(target,this.arena))target=nearest;
      direction=this.steer(e,target);
      if(d<3.1&&Math.abs(angleDelta(e.facing,angle(e,nearest)))<.44&&this.rng()<dt*5)this.lunge(e);
    } else {
      // Choose a short, walkable escape ray. Clearance/look-ahead avoids hugging dead ends.
      let best=-Infinity;
      for(let i=0;i<16;i++){
        const a=i*Math.PI/8,q={x:e.x+Math.sin(a)*2,z:e.z+Math.cos(a)*2};if(!clearPath(e,q,this.arena))continue;
        const clearance=Math.min(this.arena.width/2-Math.abs(q.x),this.arena.depth/2-Math.abs(q.z));
        const value=Math.min(...enemies.map(g=>distance(q,g)))+Math.min(2,clearance)*.35+Math.cos(a-e.facing)*.35;
        if(value>best){best=value;direction=a;}
      }
      e.held=d<6.5&&e.battery>26&&clearPath(e,nearest,this.arena,0,true);
      if(e.battery<40&&d>7){let pad=this.pickups.find(p=>p.readyAt<=this.now);if(pad)direction=this.steer(e,pad);}
    }
    const t=this.now-e.lungeAt;if(e.role==='goose'&&t<TUNE.windup+TUNE.dashTime+TUNE.recovery)direction=e.lungeAngle;
    e.facing=direction;const speed=this.speed(e),q=slide(e,Math.sin(direction)*speed*dt,Math.cos(direction)*speed*dt,this.arena);
    e.vx=(q.x-e.x)/dt;e.vz=(q.z-e.z)/dt;e.x=q.x;e.z=q.z;
  }
  step(dt=.05){
    if(this.phase==='results')return;this.now+=dt;this.elapsed+=dt;
    for(const e of this.entities){if(e.bot)this.bot(e,dt);
      else if(e.role==='goose'&&this.now-e.lungeAt>=TUNE.windup&&this.now-e.lungeAt<TUNE.windup+TUNE.dashTime&&e.frozenUntil<=this.now){const q=slide(e,Math.sin(e.lungeAngle)*this.speed(e)*dt,Math.cos(e.lungeAngle)*this.speed(e)*dt,this.arena);e.x=q.x;e.z=q.z;}
      if(e.role!=='kid')continue;
      e.light=e.held&&(e.light?e.battery>0:e.battery>=TUNE.minimumBattery);
      if(e.light){e.lastLight=this.now;e.battery=Math.max(0,e.battery-TUNE.drain*dt);}else if(this.now-e.lastLight>=TUNE.rechargeDelay&&!(this.mode==='multi'&&this.elapsed>=60))e.battery=Math.min(100,e.battery+TUNE.recharge*dt);
      e.score+=10*dt;
      let target:Entity|undefined;
      if(e.light)for(const g of this.entities)if(g.role==='goose'&&distance(e,g)<=TUNE.range&&clearPath(e,g,this.arena,0,true)&&(!target||distance(e,g)<distance(e,target)))target=g;
      const desired=target?angle(e,target):e.facing,delta=angleDelta(e.aim,desired);e.aim+=Math.max(-TUNE.aimSpeed*dt,Math.min(TUNE.aimSpeed*dt,delta));
      // Resolve defence before any catches: completed freeze always wins a simultaneous touch.
      for(const g of this.entities){if(g.role!=='goose')continue;
        const hit=e.light&&distance(e,g)<=TUNE.range&&Math.abs(angleDelta(e.aim,angle(e,g)))<=TUNE.halfCone&&clearPath(e,g,this.arena,0,true);
        e.dwell[g.id]=hit?(e.dwell[g.id]??0)+dt:0;
        if(e.dwell[g.id]>=TUNE.dwell&&g.immuneUntil<=this.now&&g.frozenUntil<=this.now&&e.battery>=TUNE.freezeCost){g.frozenUntil=this.now+TUNE.freeze;g.immuneUntil=g.frozenUntil+TUNE.immunity;e.battery-=TUNE.freezeCost;e.score+=25;e.dwell[g.id]=0;this.event('freeze',e,g);}
      }
      for(const p of this.pickups)if(p.readyAt<=this.now&&distance(e,p)<.9){e.battery=Math.min(100,e.battery+50);e.score+=10;p.readyAt=this.now+8;this.event('pickup',e);const pads=[...this.arena.pads].sort((a,b)=>distance(b,e)-distance(a,e));p.x=pads[0].x;p.z=pads[0].z;}
    }
    for(const g of this.entities){if(g.role!=='goose'||g.frozenUntil>this.now||g.safeUntil>this.now)continue;
      const t=this.now-g.lungeAt,lunging=t>=TUNE.windup&&t<TUNE.windup+TUNE.dashTime;
      for(const k of this.entities){if(k.role!=='kid')continue;const d=distance(g,k);
        g.touch[k.id]=d<TUNE.catchRadius?(g.touch[k.id]??0)+dt:0;
        if(g.touch[k.id]>=.1||lunging&&d<TUNE.lungeRadius){
          // A beam about to complete in the runner grace window also protects the kid.
          if(k.light&&(k.dwell[g.id]??0)>=TUNE.dwell-.05&&g.immuneUntil<=this.now)continue;
          k.role='goose';k.light=false;k.held=false;k.safeUntil=this.now+1.5;k.frozenUntil=this.now+.6;k.touch={};g.score+=300;g.lungeHit=true;this.firstCatch??=this.elapsed;this.event('catch',g,k);
        }
      }
      if(t>=TUNE.windup+TUNE.dashTime&&t<TUNE.windup+TUNE.dashTime+dt&&!g.lungeHit){this.event('miss',g);for(const k of this.entities)if(k.role==='kid'&&distance(g,k)<1.6){k.score+=50;k.battery=Math.min(100,k.battery+10);this.event('near',g,k);}}
    }
    const kids=this.entities.filter(e=>e.role==='kid');
    if(!kids.length||this.mode==='multi'&&this.elapsed>=TUNE.roundSeconds){this.phase='results';for(const e of this.entities)e.score+=kids.length?e.role==='kid'?500:0:e.role==='goose'?250:0;this.event(kids.length?'dawn':'flock',this.entities[0]);}
  }
  snapshot(code=''):ChaseSnapshot{return {code,now:this.now,elapsed:this.elapsed,mode:this.mode,phase:this.phase,entities:this.entities,pickups:this.pickups,events:this.events,firstCatch:this.firstCatch};}
}
