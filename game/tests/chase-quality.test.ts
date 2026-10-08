import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ChaseQuality} from '../client/chase-quality';
test('quality samples title then bounds sustained slow frames without oscillating',()=>{
  const q=new ChaseQuality(false,3);let now=1;for(let i=0;i<121;i++)q.frame(now+=45,true);
  assert.equal(q.tier,'low');assert.ok(q.ratio<=1);
  for(let i=0;i<1000;i++)q.frame(now+=30,false);
  assert.ok(q.ratio>=.6&&q.ratio<=.601);
  const low=q.ratio;for(let i=0;i<200;i++)q.frame(now+=10,false);assert.equal(q.ratio,low);
  for(let i=0;i<500;i++)q.frame(now+=10,false);assert.ok(q.ratio>low&&q.ratio<=1);
});
test('hidden frames and hit-stop do not degrade quality; phone cap is1.5',()=>{
  const q=new ChaseQuality(true,3);for(let i=1;i<400;i++)q.frame(i*100,true,true);
  assert.equal(q.ratio,1.5);assert.equal(q.tier,'medium');
  for(let i=400;i<700;i++)q.frame(i*16.667,false);assert.equal(q.ratio,1.5);
});
test('active stalls reduce quality while a hidden-return gap is excluded',()=>{
  const q=new ChaseQuality(true,1);let now=1;
  for(let i=0;i<80;i++)q.frame(now+=300,false);
  assert.equal(q.tier,'low');assert.ok(q.ratio<=.601);
  const visible=new ChaseQuality(true,1.5);
  visible.frame(1,false);visible.frame(100000,false,true);
  visible.frame(200000,false);
  for(let i=1;i<61;i++)visible.frame(200000+i*16.667,false);
  assert.equal(visible.ratio,1.5);assert.equal(visible.tier,'medium');
});
test('stable 60Hz frames can restore resolution after sustained headroom',()=>{
  const q=new ChaseQuality(true,1);let now=1;
  for(let i=0;i<80;i++)q.frame(now+=300,false);
  const low=q.ratio;assert.ok(low<=.601);
  for(let i=0;i<180;i++)q.frame(now+=1000/60,false);
  assert.equal(q.ratio,low);
  for(let i=0;i<600;i++)q.frame(now+=1000/60,false);
  assert.ok(q.ratio>low&&q.ratio<=1);
});
