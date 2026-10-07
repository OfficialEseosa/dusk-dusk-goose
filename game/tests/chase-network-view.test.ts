import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ServerClock,RemotePositions} from '../client/chase-network-view.js';
import {ChaseSimulation} from '../server/chase-simulation.js';
test('clock uses lowest RTT of eight samples and smooths a better offset over500ms',()=>{
  const c=new ServerClock();c.sample(100,200,1150);assert.equal(c.now(200),1200);c.sample(1000,1200,3000);assert.equal(c.now(1700),2700);
  c.sample(2000,2020,4010);assert.equal(c.now(2020),3020);assert.equal(c.now(2270),3770);assert.equal(c.now(2520),4520);
  c.sample(3000,3010,3005);const before=c.now(3010);assert.ok(c.now(3020)>=before,'clock corrections never send the displayed time backwards');
});
test('remote presentation interpolates, never extrapolates and clears when role/run changes',()=>{
  const s=new ChaseSimulation(),e=s.add('a','A');const r=new RemotePositions();e.x=0;r.receive(0,[e]);e.x=1;r.receive(.1,[e]);assert.equal(r.at('a',.05,e).x,.5);assert.equal(r.at('a',2,e).x,1);
  e.role='goose';e.x=4;r.receive(.15,[e]);assert.equal(r.at('a',0,e).x,4);r.clear();assert.deepEqual(r.at('a',0,{x:9,z:9}),{x:9,z:9});
});
