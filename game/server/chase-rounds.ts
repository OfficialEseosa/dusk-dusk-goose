import {randomUUID} from 'node:crypto';
import {TUNE,PARK,CULDESAC,distance,type MultiplayerState,type Point} from '../shared/chase.js';
import {ChaseSimulation} from './chase-simulation.js';
export interface Player {id:string;name:string}
/** Room-owned three-round match. Wall deadlines keep breaks independent of simulation time. */
export class MultiplayerDirector {
  round=0;stage:MultiplayerState['stage']='joining';deadline:number;runId=randomUUID();
  startingGeese:string[]=[];winner:string|null=null;
  scores=new Map<string,{id:string;name:string;total:number;round:number;starts:number}>();
  private previous=new Set<string>();private ready=new Set<string>();private scored=false;
  private players:Player[]=[];
  constructor(now=Date.now(),private seed=Date.now()){this.deadline=now+3000;}
  readyForNext(id:string){this.ready.add(id);}
  private roster(players:Player[]){for(const p of players)if(!this.scores.has(p.id))this.scores.set(p.id,{id:p.id,name:p.name,total:0,round:0,starts:0});}
  private choose(players:Player[]){return [...players].sort((a,b)=>{
    const excludedA=players.length>1&&this.previous.has(a.id)?1:0,excludedB=players.length>1&&this.previous.has(b.id)?1:0;
    const x=this.scores.get(a.id)!,y=this.scores.get(b.id)!;return excludedA-excludedB||x.starts-y.starts||x.total-y.total||a.id.localeCompare(b.id);
  }).slice(0,players.length===6?2:1).map(p=>p.id);}
  begin(players:Player[],now:number){
    const active=new Set(players.map(p=>p.id));for(const id of this.scores.keys())if(!active.has(id))this.scores.delete(id);
    this.players=players.map(p=>({id:p.id,name:p.name}));this.roster(players);if(this.round===3){this.round=0;for(const s of this.scores.values()){s.total=0;s.starts=0;}}
    this.round++;this.runId=randomUUID();this.stage='countdown';this.deadline=now+3000;this.ready.clear();this.scored=false;this.winner=null;
    this.startingGeese=this.choose(players);this.previous=new Set(this.startingGeese);
    const sim=new ChaseSimulation('multi',this.seed+this.round,players.length>=4?CULDESAC:PARK);
    for(const p of players.filter(p=>!this.startingGeese.includes(p.id)))sim.add(p.id,p.name);
    while(sim.entities.length<Math.max(4,players.length)-this.startingGeese.length)sim.add(`filler-${sim.entities.length}`,`Kid ${sim.entities.length+1}`,true);
    const kids=[...sim.entities];
    const candidates:Point[]=players.length>=4?[{x:15,z:-9},{x:-15,z:-9},{x:15,z:9},{x:-15,z:9}]:[{x:10,z:-7},{x:-10,z:-7},{x:10,z:7},{x:-10,z:7}];
    const used:Point[]=[];for(const id of this.startingGeese){const p=players.find(p=>p.id===id)!;
      const position=candidates.filter(p=>used.every(q=>distance(p,q)>3)).sort((a,b)=>Math.min(...kids.map(k=>distance(k,b)))-Math.min(...kids.map(k=>distance(k,a))))[0];used.push(position);
      const goose=sim.add(id,p.name,false,'goose',position);goose.safeUntil=4.5;sim.startingGeese.add(id);this.scores.get(id)!.starts++;
    }
    for(const s of this.scores.values())s.round=0;
    return sim;
  }
  update(sim:ChaseSimulation,players:Player[],now:number):ChaseSimulation|undefined {
    this.players=players.map(p=>({id:p.id,name:p.name}));this.roster(players);
    if(this.stage==='joining'&&now>=this.deadline)return this.begin(players,now);
    if(this.stage==='countdown'&&now>=this.deadline){this.stage='playing';this.deadline=now+TUNE.roundSeconds*1000;}
    if(this.stage==='playing'&&sim.phase==='results'){
      this.stage='results';this.deadline=now+6000;this.ready.clear();
      if(!this.scored){for(const s of this.scores.values()){s.round=sim.entities.find(e=>e.id===s.id)?.score??0;s.total+=s.round;}this.scored=true;}
      if(this.round===3)this.winner=[...this.scores.values()].sort((a,b)=>b.total-a.total)[0]?.id??null;
    }
    if(this.stage==='results'&&(now>=this.deadline||now>=this.deadline-2000&&players.every(p=>this.ready.has(p.id))))return this.begin(players,now);
  }
  snapshot(sim:ChaseSimulation,now:number):MultiplayerState {
    return {runId:this.runId,round:this.round,stage:this.stage,deadline:this.deadline,serverTime:now,startingGeese:this.startingGeese,lastKid:sim.lastKid??null,
      scores:[...this.scores.values()].map(s=>({...s,round:this.stage==='results'?s.round:sim.entities.find(e=>e.id===s.id)?.score??0})),winner:this.winner,nextGeese:this.stage==='results'&&this.round<3?this.choose(this.players):[]};
  }
}
