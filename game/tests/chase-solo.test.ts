import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChaseSimulation} from '../server/chase-simulation.js';
import {SoloDirector} from '../server/chase-solo.js';
import {TUNE,tonightSeed,walkable,distance} from '../shared/chase.js';
import {readBest,saveBest,recordRun,torchReward} from '../client/chase-best.js';
function solo(){const sim=new ChaseSimulation('solo',20261007);const kid=sim.add('kid','Kid');const director=new SoloDirector(20261007,kid.id,true);director.prepare(sim);return {sim,kid,director};}
test('first goose appears at1.5s, threatens an idle kid by5s, beginner beam freezes once',()=>{
  const {sim,kid,director}=solo();
  const tick=(n:number)=>{for(let i=0;i<n;i++){sim.step();director.update(sim,.05);}};
  tick(29);assert.equal(sim.entities.length,1);tick(2);const goose=sim.entities[1];assert.equal(goose.personality,0);assert.ok(walkable(goose));assert.equal(sim.dwellNeeded(goose),.1);
  tick(48);assert.ok(distance(kid,goose)<9);kid.held=true;tick(12);
  assert.ok(sim.events.some(e=>e.type==='freeze'));assert.equal(sim.dwellNeeded(goose),TUNE.dwell);assert.equal(kid.role,'kid');
});
test('solo director escalates to ten, assigns four personalities, and gives30s milestone relief',()=>{
  const {sim,kid,director}=solo();
  // Move the director clock without faking rules outcomes: this isolates its schedule from catch resolution.
  for(let t=.05;t<125;t+=.05){sim.now=sim.elapsed=t;director.update(sim,.05);}
  assert.equal(director.spawned,10);assert.deepEqual(sim.entities.slice(1,5).map(e=>e.personality),[0,1,2,3]);assert.equal(director.hour,4);assert.equal(sim.survivalMultiplier,5);assert.equal(kid.battery,100);assert.ok(sim.events.filter(e=>e.type==='hour').length===4);
  assert.ok(sim.entities.slice(1).every(e=>walkable(e)));assert.equal(director.snapshot().nextSpawnAt,null);
});
test('milestone stuns geese1.5 seconds and preserves a longer freeze',()=>{
  const {sim,kid,director}=solo();sim.now=sim.elapsed=29.9;director.update(sim,.05);const goose=sim.entities[1];goose.frozenUntil=34;kid.battery=5;sim.now=sim.elapsed=30.01;director.update(sim,.05);
  assert.equal(kid.battery,100);assert.ok(sim.entities.filter(e=>e.role==='goose').every(e=>e.frozenUntil>=31.5));assert.equal(goose.frozenUntil,34);
});
test('high intensity delays only one spawn by at most4 seconds',()=>{
  const {sim,kid,director}=solo();sim.now=sim.elapsed=1.5;director.update(sim,.05);
  sim.now=sim.elapsed=9;for(let i=0;i<4;i++)sim.event('freeze',kid);director.update(sim,.05);assert.equal(director.snapshot().nextSpawnAt,14);director.update(sim,.05);assert.equal(director.snapshot().nextSpawnAt,14);
});
test('daily pickup shuffle is repeatable and day is UTC',()=>{
  assert.equal(tonightSeed(Date.parse('2026-10-08T00:01:00Z')),20261008);assert.deepEqual(solo().sim.pickups,solo().sim.pickups);assert.ok(solo().sim.pickups.every(p=>walkable(p)));
});
test('local best validates corrupt/blocked storage and counts each result once',()=>{
  const empty=readBest({getItem:()=>'{bad'});assert.equal(empty.runs,0);assert.equal(readBest({getItem:()=>'{"time":-2,"runs":null}'}).time,0);
  const done=recordRun(empty,'one',35,500);assert.equal(done.runs,1);assert.equal(recordRun(done,'one',35,500).runs,1);assert.equal(recordRun(done,'two',20,200).time,35);
  saveBest(done,{setItem:()=>{throw new Error('Blocked');}});assert.equal(torchReward(30).color,'#ffc873');assert.equal(torchReward(60).color,'#ffb3bd');assert.equal(torchReward(120).color,'#d6b4ff');
});
