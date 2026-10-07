import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PositionHistory,segmentDistance} from '../server/chase-history.js';
import {ChaseSimulation} from '../server/chase-simulation.js';
test('position history interpolates and stays bounded to eleven samples and500ms',()=>{
  const h=new PositionHistory();for(let i=0;i<100;i++){h.record('a',i/20,{x:i,z:0});h.record('a',i/20,{x:i,z:0});}
  assert.equal(h.count('a'),11);assert.ok(Math.abs(h.at('a',4.925,{x:0,z:0}).x-98.5)<1e-12);assert.equal(h.at('a',0,{x:0,z:0}).x,89);assert.equal(segmentDistance({x:1,z:1},{x:0,z:0},{x:2,z:0}),1);
});
test('beam rewind favours kid within200ms but cannot retrieve a much older near goose',()=>{
  const s=new ChaseSimulation('multi'),k=s.add('k','Kid',false,'kid',{x:-10,z:7}),g=s.add('g','Goose',false,'goose',{x:10,z:7});k.held=true;k.aim=Math.PI/2;s.viewDelay.set(k.id,10);
  s.now=.5;s.history.record(g.id,.1,{x:-6,z:7});s.history.record(g.id,.25,{x:10,z:7});
  for(let i=0;i<6;i++)s.step(.05);assert.equal(g.frozenUntil,0);assert.ok(k.battery>75);
  const t=new ChaseSimulation('multi'),kid=t.add('kid','Kid',false,'kid',{x:-10,z:7}),goose=t.add('goose','Goose',false,'goose',{x:0,z:7});kid.held=true;kid.aim=Math.PI/2;t.viewDelay.set(kid.id,.2);t.now=.5;
  t.history.record(goose.id,.3,{x:-6,z:7});t.history.record(goose.id,.5,{x:0,z:7});t.step(.05);assert.ok(kid.dwell.goose>0,'recent visible position contributes dwell');
});
test('lunge sweeps the dash segment rather than missing a kid between endpoints',()=>{
  const s=new ChaseSimulation('multi'),g=s.add('g','G',false,'goose',{x:-10,z:7}),k=s.add('k','K',false,'kid',{x:-8.55,z:7});s.add('other','Other',false,'kid',{x:10,z:7});g.safeUntil=0;g.facing=Math.PI/2;s.lunge(g);s.step(.1);s.step(.1);assert.equal(k.role,'goose');assert.equal(s.events.filter(e=>e.type==='catch').length,1);
});
test('lunge uses recent150ms kid history but clamps older claims; one slow passive tick is never a catch',()=>{
  for(const recent of [true,false]){
    const s=new ChaseSimulation('multi'),g=s.add('g','Goose',false,'goose',{x:-10,z:7}),k=s.add('k','Kid',false,'kid',{x:-6,z:7});s.add('other','Other',false,'kid',{x:10,z:7});s.now=.5;g.safeUntil=0;g.facing=Math.PI/2;g.lungeAngle=Math.PI/2;g.lungeAt=.38;s.viewDelay.set(g.id,100);
    s.history.record(k.id,recent?.35:.2,{x:-9.3,z:7});s.history.record(k.id,recent?.4:.3,{x:recent?-9.3:-6,z:7});s.history.record(k.id,.5,k);
    s.step(.05);assert.equal(k.role,recent?'goose':'kid');
  }
  const s=new ChaseSimulation('multi'),g=s.add('g','Goose',false,'goose',{x:10,z:7}),k=s.add('k','Kid',false,'kid',{x:10,z:7});g.safeUntil=0;s.step(.1);assert.equal(k.role,'kid');s.step(.05);assert.equal(k.role,'goose');
});
