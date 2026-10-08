import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PARK,CULDESAC,walkable,clearPath,arenaFor} from '../shared/chase';
import {MultiplayerDirector} from '../server/chase-rounds';
import {SnapshotEncoder,SnapshotDecoder} from '../shared/chase-wire';
const players=Array.from({length:6},(_,i)=>({id:`player-${i}`,name:`Friend ${i}`}));
test('round boundaries select exactly two arenas by human seats; wire retains layout identity',()=>{
  const director=new MultiplayerDirector(0,42);
  for(const count of [2,3,4,5,6,3]){const sim=director.begin(players.slice(0,count),0);assert.equal(sim.arena,count>=4?CULDESAC:PARK);assert.equal(sim.lamps.length,count>=4?3:1);assert.equal(sim.pickups.length,count>=4?3:2);assert.ok(sim.entities.every(e=>walkable(e,sim.arena)));assert.ok(sim.pickups.every(e=>walkable(e,sim.arena)));
    const snapshot=sim.snapshot(),encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder(),packet=encoder.encode(snapshot);for(const message of packet.messages)decoder.accept(message);const restored=decoder.decode(packet.frame);assert.equal(arenaFor(restored.arena),sim.arena);assert.equal(restored.lamps?.length,sim.lamps.length);
  }
});
test('Cul-de-sac pond blocks swept movement but lets light pass; notches and back alleys stay open',()=>{
  assert.equal(walkable({x:0,z:0},CULDESAC),false);assert.equal(walkable({x:1.9,z:1.9},CULDESAC),true);
  assert.equal(clearPath({x:-3,z:0},{x:3,z:0},CULDESAC),false);assert.equal(clearPath({x:-3,z:0},{x:3,z:0},CULDESAC,0,true),true);
  for(const p of [{x:-8.9,z:-5.5},{x:8.9,z:5.5},{x:-15,z:-6},{x:15,z:6}])assert.equal(walkable(p,CULDESAC),true);
  assert.equal(clearPath({x:-15,z:-9},{x:-15,z:9},CULDESAC),true);assert.equal(clearPath({x:15,z:-9},{x:15,z:9},CULDESAC),true);
  assert.equal(walkable({x:17,z:0},CULDESAC),false);assert.equal(clearPath({x:8,z:-6},{x:14,z:-6},CULDESAC,0,true),false);
});
