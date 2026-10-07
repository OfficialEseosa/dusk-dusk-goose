import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChaseSimulation} from '../server/chase-simulation.js';
import {clearPath,walkable} from '../shared/chase.js';
test('Park rejects endpoints and swept movement through solids',()=>{
  assert.equal(walkable({x:0,z:0}),false);assert.equal(walkable({x:13,z:0}),false);
  assert.equal(clearPath({x:-4,z:0},{x:4,z:0}),false);assert.equal(clearPath({x:-4,z:6},{x:4,z:6}),true);
});
test('auto aim freezes a pursuing goose while kid faces away; flat cost and immunity prevent chain freeze',()=>{
  const s=new ChaseSimulation();const k=s.add('k','Kid',false,'kid',{x:-4,z:6});const g=s.add('g','Goose',false,'goose',{x:0,z:6});
  k.facing=-Math.PI/2;k.aim=Math.PI/2;k.held=true;g.safeUntil=0;
  for(let i=0;i<6;i++)s.step();assert.ok(g.frozenUntil>s.now);assert.ok(k.battery<70);assert.equal(s.events.filter(e=>e.type==='freeze').length,1);
  for(let i=0;i<28;i++)s.step();assert.equal(s.events.filter(e=>e.type==='freeze').length,1);
});
test('walls block beam dwell',()=>{
  const s=new ChaseSimulation();const k=s.add('k','Kid',false,'kid',{x:-4,z:0});const g=s.add('g','Goose',false,'goose',{x:4,z:0});k.held=true;k.aim=Math.PI/2;
  for(let i=0;i<20;i++)s.step();assert.equal(g.frozenUntil,0);
});
test('passive catch requires consecutive overlap and conversion has grace',()=>{
  const s=new ChaseSimulation('multi');const k=s.add('k','Kid',false,'kid',{x:-4,z:6});const g=s.add('g','Goose',false,'goose',{x:-3.2,z:6});s.add('other','Friend');g.safeUntil=0;
  s.step();assert.equal(k.role,'kid');s.step();assert.equal(k.role,'goose');assert.ok(k.safeUntil>s.now);assert.equal(k.light,false);
});
test('completed freeze beats catch on same tick',()=>{
  const s=new ChaseSimulation('multi');const k=s.add('k','Kid',false,'kid',{x:-4,z:6});const g=s.add('g','Goose',false,'goose',{x:-3.2,z:6});s.add('o','Other');g.safeUntil=0;k.held=true;k.aim=Math.PI/2;k.dwell.g=.2;g.touch.k=.05;
  s.step();assert.equal(k.role,'kid');assert.ok(g.frozenUntil>s.now);
});
test('lunge has windup, direction lock and cooldown',()=>{
  const s=new ChaseSimulation();s.add('k','Kid');const g=s.add('g','Goose',false,'goose');g.safeUntil=0;assert.ok(s.lunge(g));assert.equal(s.speed(g),0);assert.equal(s.lunge(g),false);
  for(let i=0;i<3;i++)s.step();assert.ok(s.speed(g)>10);
});
test('battery drains, cannot flicker empty, recharges only after delay',()=>{
  const s=new ChaseSimulation();const k=s.add('k','Kid');s.add('g','Goose');k.battery=9;k.held=true;s.step();assert.equal(k.light,false);k.battery=100;s.step();assert.equal(k.light,true);k.held=false;
  const battery=k.battery;for(let i=0;i<30;i++)s.step();assert.equal(k.battery,battery);for(let i=0;i<20;i++)s.step();assert.ok(k.battery>battery);
});
test('seeded runs deterministic and events remain bounded',()=>{
  const run=()=>{const s=new ChaseSimulation('multi',42);for(let i=0;i<4;i++)s.add(String(i),'Bot',true,i?'kid':'goose');for(let i=0;i<1500;i++)s.step();assert.ok(s.events.length<=48);return s.snapshot();};
  assert.deepEqual(run(),run());
});

