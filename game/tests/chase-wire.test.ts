import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SnapshotEncoder,SnapshotDecoder,encodeInput,decodeInput} from '../shared/chase-wire.js';
import {ChaseSimulation} from '../server/chase-simulation.js';
import {SoloDirector} from '../server/chase-solo.js';
import {MultiplayerDirector} from '../server/chase-rounds.js';
test('binary frames preserve centimetre positions, angles, score and all active gameplay timers',()=>{
  const s=new ChaseSimulation('multi'),d=new MultiplayerDirector(0,1);const sim=d.begin([{id:'a',name:'Alex'},{id:'b',name:'Riley'}],0);
  const e=sim.entities[0];sim.now=4;e.x=-3.123;e.z=7.156;e.facing=-1.2;e.aim=2.3;e.battery=27.2;e.score=123.456;e.vx=4.12;e.vz=-2.34;e.frozenUntil=4.6;e.immuneUntil=8.6;e.safeUntil=5.5;e.lungeAt=3.9;
  const snapshot={...sim.snapshot('ABCDE'),multi:d.snapshot(sim,1234)},encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder(),p=encoder.encode(snapshot);p.messages.forEach(m=>decoder.accept(m));const out=decoder.decode(p.frame),x=out.entities[0];
  assert.ok(Math.abs(x.x-e.x)<=.005);assert.ok(Math.abs(x.z-e.z)<=.005);assert.ok(Math.abs(Math.atan2(Math.sin(x.facing-e.facing),Math.cos(x.facing-e.facing)))<Math.PI/128);assert.ok(Math.abs(x.score-e.score)<.0001);assert.equal(x.vx,e.vx);assert.equal(x.vz,e.vz);assert.equal(x.frozenUntil,4.6);assert.equal(x.safeUntil,5.5);assert.equal(out.multi!.serverTime,1234);assert.equal(out.multi!.scores[0].round,out.entities.find(e=>e.id===out.multi!.scores[0].id)!.score);
  assert.deepEqual(encoder.encode(snapshot).messages,[]);assert.ok(p.frame.length<JSON.stringify(snapshot).length/6);
  sim.now=10;const expired=encoder.encode({...sim.snapshot('ABCDE'),multi:d.snapshot(sim,2234)});expired.messages.forEach(m=>decoder.accept(m));const old=decoder.decode(expired.frame).entities[0];assert.equal(old.frozenUntil,0);assert.equal(old.immuneUntil,0);assert.equal(old.safeUntil,0);
  assert.throws(()=>decoder.decode(p.frame.subarray(0,-1)));assert.throws(()=>new SnapshotDecoder().decode(p.frame));
});
test('events send once, histories cap48, role changes travel in state, and a new run resets reused event ids',()=>{
  const sim=new ChaseSimulation(),kid=sim.add('kid','Kid'),solo=new SoloDirector(20261007,kid.id,true);solo.prepare(sim);const enc=new SnapshotEncoder(),dec=new SnapshotDecoder();
  const update=()=>{const packet=enc.encode({...sim.snapshot('ABCDE'),solo:solo.snapshot()});packet.messages.forEach(m=>dec.accept(m));return {s:dec.decode(packet.frame),packet};};
  update();sim.event('pickup',kid);assert.equal(update().s.events.length,1);assert.equal(update().packet.messages.length,0);kid.role='goose';assert.equal(update().s.entities[0].role,'goose');
  const resumed=new SnapshotDecoder();resumed.reset({...sim.snapshot('ABCDE'),solo:solo.snapshot()});resumed.accept({type:'events',events:[...sim.events]});const warm=enc.encode({...sim.snapshot('ABCDE'),solo:solo.snapshot()});warm.messages.forEach(m=>resumed.accept(m));assert.equal(resumed.decode(warm.frame).events.length,1,'full resume history and event frames cannot duplicate a cue');
  for(let i=0;i<100;i++){sim.event('freeze',kid);update();}assert.equal(update().s.events.length,48);
  const next=new ChaseSimulation(),k=next.add('kid','Kid'),director=new SoloDirector(20261007,k.id,false);next.event('pickup',k);const packet=enc.encode({...next.snapshot('ABCDE'),solo:director.snapshot()});packet.messages.forEach(m=>dec.accept(m));assert.equal(dec.decode(packet.frame).events.length,1);
});
test('input is sixteen bytes, wraps the clock only, and rejects malformed frames',()=>{
  const input={type:'input' as const,seq:123456789,x:-12.34,z:7.89,facing:-Math.PI/2,held:true,lunge:true,clientTime:4294967300};const bytes=encodeInput(input),out=decodeInput(bytes);assert.equal(bytes.length,16);assert.equal(out.seq,input.seq);assert.equal(out.clientTime,4);assert.equal(out.x,input.x);assert.equal(out.z,input.z);assert.equal(out.held,true);assert.equal(out.lunge,true);assert.equal(out.facing,Math.PI*1.5);assert.throws(()=>decodeInput(bytes.subarray(0,15)));bytes[14]=255;assert.throws(()=>decodeInput(bytes));
});
