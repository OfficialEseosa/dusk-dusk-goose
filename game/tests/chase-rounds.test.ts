import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MultiplayerDirector} from '../server/chase-rounds.js';
import {ChaseSimulation} from '../server/chase-simulation.js';
const players=Array.from({length:6},(_,i)=>({id:`p${i}`,name:`Friend ${i}`}));
test('three-round rotation fills four seats, counts scores once, and resets totals for rematch',()=>{
  const d=new MultiplayerDirector(0,42);let sim=new ChaseSimulation();let now=3000;
  sim=d.update(sim,players.slice(0,3),now)!;const starts:string[]=[];
  for(let round=1;round<=3;round++){
    assert.equal(sim.entities.length,4);assert.equal(sim.entities.filter(e=>e.role==='goose').length,1);assert.equal(d.stage,'countdown');starts.push(d.startingGeese[0]);
    now+=3000;d.update(sim,players.slice(0,3),now);assert.equal(d.stage,'playing');
    sim.entities.find(e=>e.id==='p0')!.score=100;sim.phase='results';d.update(sim,players.slice(0,3),++now);
    d.update(sim,players.slice(0,3),++now);assert.equal(d.scores.get('p0')!.total,round*100);
    if(round===3)assert.equal(d.winner,'p0');
    now+=6000;sim=d.update(sim,players.slice(0,3),now)!;
  }
  assert.equal(new Set(starts).size,3);assert.equal(d.round,1);assert.equal(d.scores.get('p0')!.total,0);assert.equal(d.winner,null);
});
test('six humans have two starting geese; two humans alternate and all-ready skips only after four seconds',()=>{
  const six=new MultiplayerDirector(0,1),sim=six.begin(players,0);assert.equal(sim.entities.length,6);assert.equal(six.startingGeese.length,2);const geese=sim.entities.filter(e=>e.role==='goose');assert.ok(Math.hypot(geese[0].x-geese[1].x,geese[0].z-geese[1].z)>3);
  const d=new MultiplayerDirector(0,1),p=players.slice(0,2);let s=d.begin(p,0);const first=d.startingGeese[0];
  d.update(s,p,3000);s.phase='results';d.update(s,p,3100);assert.notEqual(d.snapshot(s,3100).nextGeese[0],first);for(const person of p)d.readyForNext(person.id);
  assert.equal(d.update(s,p,7099),undefined);s=d.update(s,p,7100)!;assert.ok(s);assert.notEqual(d.startingGeese[0],first);
});
test('last kid refills once, moves eight percent faster and earns double survival; starting goose catch bonus is once',()=>{
  const s=new ChaseSimulation('multi');const a=s.add('a','A',false,'goose',{x:9,z:7}),b=s.add('b','B',false,'kid',{x:9,z:7}),c=s.add('c','C',false,'kid',{x:-10,z:7});
  s.startingGeese.add(a.id);a.safeUntil=0;s.step(.05);s.step(.05);assert.equal(b.role,'goose');assert.equal(a.score,400);assert.equal(s.lastKid,'c');assert.equal(c.battery,100);assert.equal(s.speed(c),5.4);
  const score=c.score;c.battery=50;s.step(.05);assert.equal(c.score-score,1);assert.ok(c.battery<51);
  a.x=c.x;a.z=c.z;b.safeUntil=100;s.step(.05);s.step(.05);assert.equal(a.score,950);assert.equal(s.phase,'results');
});
test('dawn ends at75 seconds, surviving kids gain500 and converted players keep their earlier score',()=>{
  const s=new ChaseSimulation('multi');const k=s.add('kid','Kid');s.add('goose','Goose',false,'goose',{x:10,z:-7});s.elapsed=74.95;s.step(.05);assert.equal(s.phase,'results');assert.equal(k.score,500.5);assert.equal(s.events.at(-1)?.type,'dawn');
});
test('lamp freezes before touch, burns only while occupied, then rests twenty seconds; hunger caps and resets on catch',()=>{
  const s=new ChaseSimulation('multi'),k=s.add('k','Kid',false,'kid',{x:-3.8,z:0}),g=s.add('g','Goose',false,'goose',{x:-3.8,z:0});g.safeUntil=0;
  s.step(.05);assert.equal(k.role,'kid');assert.ok(g.frozenUntil>s.now);assert.equal(s.lamps[0].remaining,4.95);assert.equal(s.lamps[0].active,true);
  k.x=10;k.z=7;const fuel=s.lamps[0].remaining;s.step(.05);assert.equal(s.lamps[0].remaining,fuel);
  k.x=-3.8;k.z=0;s.lamps[0].remaining=.05;s.step(.05);assert.equal(s.lamps[0].active,false);assert.equal(s.lamps[0].readyAt,s.now+20);
  g.x=10;g.z=-7;s.now+=20;s.elapsed=40;s.step(.05);assert.ok(s.lamps[0].remaining>4.9);assert.ok(Math.abs(s.speed(g)-5.5*1.16)<1e-9);
  k.x=10;k.z=7;g.x=10;g.z=7;g.frozenUntil=0;s.step(.05);s.step(.05);assert.ok(s.events.some(e=>e.type==='catch'));assert.equal(s.speed(g),5.5);
});
test('breaks remain playable with a harmless freezeable goose without scoring or advancing the round',()=>{
  const s=new ChaseSimulation('multi'),k=s.add('k','Kid',false,'kid',{x:7,z:7}),g=s.add('g','Goose',false,'goose',{x:9,z:7});k.held=true;k.aim=Math.PI/2;
  for(let i=0;i<10;i++)s.practice(.05);assert.equal(s.elapsed,0);assert.equal(k.score,0);assert.equal(k.battery,100);assert.ok(g.frozenUntil>s.now);assert.equal(k.role,'kid');
});
test('a newcomer starting round three is not forced to start again when match totals reset',()=>{
  const d=new MultiplayerDirector(0,1),old=[{id:'b',name:'B'},{id:'c',name:'C'},{id:'d',name:'D'}],all=[{id:'a',name:'New'},...old];
  d.begin(old,0);d.begin(old,10);d.begin(all,20);assert.deepEqual(d.startingGeese,['a']);d.begin(all,30);assert.notDeepEqual(d.startingGeese,['a']);assert.equal(d.round,1);
});
