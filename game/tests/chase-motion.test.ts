import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceMotion} from '../client/chase-motion.js';
test('device speed is identical at10,20 and60 input ticks per second; diagonals have no speed advantage',()=>{
  for(const hz of [10,20,60]){let p={x:-3,z:7.3};for(let i=0;i<hz;i++)p=advanceMotion(p,{x:-1,z:0},5,1/hz);assert.ok(Math.abs(p.x+8)<1e-9);}
  const p=advanceMotion({x:10,z:7},{x:1,z:1},5,.1);assert.ok(Math.abs(Math.hypot(p.x-10,p.z-7)-.5)<1e-9);
});
test('device suspension is capped and movement remains swept against obstacles',()=>{
  assert.equal(advanceMotion({x:-3,z:7.3},{x:-1,z:0},5,20).x,-3.75);
  const p=advanceMotion({x:-3.5,z:0},{x:1,z:0},5,.15);assert.ok(p.x<=-3.3);
});
