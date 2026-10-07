import { ChaseSimulation } from '../server/chase-simulation.js';
import { TUNE } from '../shared/chase.js';
const count=Number(process.argv[2]??500);
const speedArg=process.argv.find(a=>a.startsWith('--goose-speed='));
if(speedArg){const value=Number(speedArg.split('=')[1]);if(!Number.isFinite(value)||value<4||value>6)throw new Error('Invalid experiment speed');(TUNE as unknown as {botSpeed:number}).botSpeed=value;}
const median=(a:number[])=>a.length?[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)]:null;
const results=[];
for(let humans=2;humans<=6;humans++){
  let wins=0,zero=0;const first:number[]=[],lengths:number[]=[];
  for(let seed=1;seed<=count;seed++){
    const sim=new ChaseSimulation('multi',seed);const participants=Math.max(4,humans);
    for(let n=0;n<participants;n++)sim.add(String(n),`Bot${n}`,true,n<(humans===6?2:1)?'goose':'kid');
    for(let i=0;i<1501&&sim.phase==='playing';i++)sim.step();
    if(sim.entities.some(e=>e.role==='kid'))wins++;if(sim.firstCatch===null)zero++;else first.push(sim.firstCatch);lengths.push(sim.elapsed);
  }
  results.push({humans,rounds:count,kidWinPercent:100*wins/count,medianFirstCatch:median(first),medianRound:median(lengths),zeroCatchPercent:100*zero/count});
}
const solo:number[]=[];
for(let seed=1;seed<=count;seed++){
  const sim=new ChaseSimulation('solo',seed);sim.add('kid','Runner',true);sim.add('goose','Chaser',true,'goose',{x:7,z:6});
  let spawned=1;
  for(let i=0;i<6000&&sim.phase==='playing';i++){if(sim.elapsed>=[10,20,32,45,60][spawned-1]&&spawned<6){sim.add(`g${spawned}`,'Flock',true,'goose',{x:spawned%2?11:-11,z:spawned%2?-7:7});spawned++;}sim.step();}
  solo.push(sim.elapsed);
}
console.log(JSON.stringify({seedRange:[1,count],botSpeed:TUNE.botSpeed,targets:{kidWinPercent:'35–45',medianFirstCatch:'10–15s',medianSolo:'35–50s',zeroCatchPercent:'<5'},results,medianSolo:median(solo)},null,2));
