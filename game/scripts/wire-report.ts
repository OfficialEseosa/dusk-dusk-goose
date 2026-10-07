import {writeFile} from 'node:fs/promises';
import {SnapshotEncoder} from '../shared/chase-wire.js';
import {MultiplayerDirector} from '../server/chase-rounds.js';
const results=[];
for(const count of [2,4,6]){
  const players=Array.from({length:count},(_,i)=>({id:`human-${i}`,name:`Friend ${i+1}`})),director=new MultiplayerDirector(0,42),encoder=new SnapshotEncoder();let sim=director.begin(players,0);director.update(sim,players,3000);
  for(const e of sim.entities)e.bot=true;
  let jsonBytes=0,wireBytes=0,metadataMessages=0,eventMessages=0,frames=0;
  for(let tick=0;tick<1500;tick++){
    if(director.stage==='playing')sim.step(.05);else sim.practice(.05);const next=director.update(sim,players,3000+tick*50);if(next){sim=next;for(const e of sim.entities)e.bot=true;}
    const snapshot={...sim.snapshot('ABCDE'),multi:director.snapshot(sim,3000+tick*50)},packet=encoder.encode(snapshot);
    jsonBytes+=Buffer.byteLength(JSON.stringify({type:'snapshot',snapshot}));wireBytes+=packet.frame.length;
    for(const m of packet.messages){wireBytes+=Buffer.byteLength(JSON.stringify(m));if(m.type==='world')metadataMessages++;else eventMessages++;}frames++;
  }
  results.push({humans:count,seconds:75,frames,jsonBytes,wireBytes,reduction:Number((jsonBytes/wireBytes).toFixed(2)),wireBytesPerSecond:Math.ceil(wireBytes/75),metadataMessages,eventMessages,inputBytes:16,entityCoreBytes:8,entityTimingAndMotionBytes:19});
}
await writeFile('evidence/phase3/wire-report.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
