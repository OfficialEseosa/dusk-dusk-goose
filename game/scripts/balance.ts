import { ChaseSimulation } from '../server/chase-simulation.js';
import { TUNE } from '../shared/chase.js';
import { SoloDirector } from '../server/chase-solo.js';
import {MultiplayerDirector} from '../server/chase-rounds.js';
const count=Number(process.argv[2]??500);
const speedArg=process.argv.find(a=>a.startsWith('--goose-speed='));
if(speedArg){const value=Number(speedArg.split('=')[1]);if(!Number.isFinite(value)||value<4||value>6)throw new Error('Invalid experiment speed');(TUNE as unknown as {botSpeed:number}).botSpeed=value;}
const median=(a:number[])=>a.length?[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)]:null;
const results=[];
for(let humans=2;humans<=6;humans++){
  let wins=0,zero=0;const first:number[]=[],lengths:number[]=[];
  for(let seed=1;seed<=count;seed++){
    const sim=new MultiplayerDirector(0,seed).begin(Array.from({length:humans},(_,n)=>({id:String(n),name:`Bot${n}`})),0);
    for(const entity of sim.entities)entity.bot=true;
    for(let i=0;i<60;i++)sim.practice(.05);
    for(let i=0;i<1501&&sim.phase==='playing';i++)sim.step();
    if(sim.entities.some(e=>e.role==='kid'))wins++;if(sim.firstCatch===null)zero++;else first.push(sim.firstCatch);lengths.push(sim.elapsed);
  }
  results.push({humans,arena:humans>=4?'culdesac':'park',rounds:count,kidWinPercent:100*wins/count,medianFirstCatch:median(first),medianRound:median(lengths),zeroCatchPercent:100*zero/count});
}
const solo:number[]=[];
for(let seed=1;seed<=count;seed++){
  const sim=new ChaseSimulation('solo',seed);sim.add('kid','Runner',true);const director=new SoloDirector(20261007,'kid',true);director.prepare(sim);
  for(let i=0;i<6000&&sim.phase==='playing';i++){sim.step();director.update(sim,.05);}
  solo.push(sim.elapsed);
}
console.log(JSON.stringify({seedRange:[1,count],botSpeed:TUNE.botSpeed,targets:{kidWinPercent:'35–45',medianFirstCatch:'10–15s',medianSolo:'35–50s',zeroCatchPercent:'<5'},results,medianSolo:median(solo)},null,2));
