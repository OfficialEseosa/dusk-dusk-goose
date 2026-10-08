import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChaseSimulation} from '../server/chase-simulation';
import {distance,walkable} from '../shared/chase';
test('lurker ambush lasts two seconds then hunts instead of camping a pickup indefinitely',()=>{
  const sim=new ChaseSimulation('multi',42);sim.pickups=[{x:0,z:6,readyAt:0},{x:10,z:-6,readyAt:0}];
  sim.add('kid','Kid',false,'kid',{x:6,z:6});const goose=sim.add('lurker','Lurker',true,'goose',{x:0,z:6});goose.personality=3;goose.safeUntil=0;
  for(let i=0;i<38;i++)sim.step(.05);assert.equal(goose.x,0);assert.equal(goose.z,6);
  for(let i=0;i<14;i++)sim.step(.05);assert.ok(goose.x>.5);assert.ok(goose.vx>0);assert.equal(sim.phase,'playing');
});
test('nearby computer teammates separate rather than fleeing as one overlapping body',()=>{
  const sim=new ChaseSimulation('multi',42),a=sim.add('a','A',true,'kid',{x:0,z:6}),b=sim.add('b','B',true,'kid',{x:.3,z:6});sim.add('goose','Goose',false,'goose',{x:10,z:6}).safeUntil=100;
  for(let i=0;i<20;i++)sim.step(.05);assert.ok(distance(a,b)>1);assert.ok(walkable(a,sim.arena)&&walkable(b,sim.arena));
});
