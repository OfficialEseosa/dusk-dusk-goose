import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createChaseServer} from '../server/chase-server.js';
import {SnapshotDecoder,encodeInput} from '../shared/chase-wire.js';
async function fixture(){const g=createChaseServer();await new Promise<void>(r=>g.server.listen(0,'127.0.0.1',r));const port=(g.server.address() as {port:number}).port;return {...g,url:`ws://127.0.0.1:${port}/ws`};}
async function client(url:string){const ws=new WebSocket(url),messages:any[]=[],decoder=new SnapshotDecoder();ws.on('message',(raw,binary)=>{const m=binary?{type:'snapshot',snapshot:decoder.decode(new Uint8Array(raw as Buffer))}:JSON.parse(raw.toString());if(m.type==='world'||m.type==='events'){decoder.accept(m);return;}if(m.type==='seat')decoder.reset(m.snapshot);messages.push(m);});await new Promise(r=>ws.once('open',r));return {ws,messages,send:(m:unknown)=>ws.send(JSON.stringify(m)),async wait(type:string){const end=Date.now()+2500;while(Date.now()<end){const index=messages.findIndex(m=>m.type===type);if(index>=0)return messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,10));}throw new Error(`Missing ${type}`);}};}
test('one server creates bounded rooms, joins, rejects teleport and resumes by private credential',async()=>{
  const g=await fixture();try{const a=await client(g.url);a.send({type:'create'});const seat=await a.wait('seat');assert.match(seat.code,/^[A-HJ-NP-Z2-9]{5}$/);
    const b=await client(g.url);b.send({type:'join',code:seat.code,name:'Friend'});await b.wait('seat');assert.equal(g.rooms.get(seat.code)!.seats.size,2);
    a.send({type:'input',seq:1,x:12,z:-8,facing:0,held:true});const correction=await a.wait('correction');assert.notEqual(correction.x,12);
    const c=await client(g.url);c.send({type:'resume',code:seat.code,token:seat.token,bootId:seat.bootId});const resumed=await c.wait('seat');assert.equal(resumed.id,seat.id);await a.wait('displaced');assert.equal(g.rooms.get(seat.code)!.seats.size,2);
    const bad=await client(g.url);bad.send({type:'resume',code:seat.code,token:'Friend',bootId:seat.bootId});await bad.wait('ended');
  }finally{await g.close();}
});
test('room cap and origin enforcement apply to production socket',async()=>{
  const g=createChaseServer({maxRooms:1});await new Promise<void>(r=>g.server.listen(0,'127.0.0.1',r));const url=`ws://127.0.0.1:${(g.server.address() as {port:number}).port}/ws`;
  try {const a=await client(url);a.send({type:'create'});await a.wait('seat');const b=await client(url);b.send({type:'create'});assert.match((await b.wait('error')).message,/busy/);
    const rejected=new WebSocket(url,{origin:'https://other.example'});await new Promise<void>((r,j)=>{rejected.on('error',()=>r());rejected.on('open',()=>j(new Error('Cross-origin accepted')));});
  }finally{await g.close();}
});
test('binary movement uses the same speed, replay and payload validation as JSON',async()=>{
  const g=await fixture();try{const a=await client(g.url);a.send({type:'create'});const seat=await a.wait('seat'),e=seat.snapshot.entities[0];
    a.ws.send(encodeInput({type:'input',seq:1,x:e.x-.1,z:e.z,facing:Math.PI/2,held:true}));await new Promise(r=>setTimeout(r,80));assert.equal(g.rooms.get(seat.code)!.seats.get(seat.id)!.seq,1);assert.equal(g.rooms.get(seat.code)!.sim.entities[0].x,e.x-.1);
    a.ws.send(encodeInput({type:'input',seq:2,x:12,z:-8,facing:0,held:false}));await a.wait('correction');
    a.ws.send(encodeInput({type:'input',seq:1,x:e.x,z:e.z,facing:0,held:false}));await new Promise(r=>setTimeout(r,60));assert.equal(g.rooms.get(seat.code)!.seats.get(seat.id)!.seq,2);
    const closed=new Promise<number>(r=>a.ws.once('close',r));a.ws.send(new Uint8Array([0xd4,1]));assert.equal(await closed,1007);
  }finally{await g.close();}
});
test('one-second movement credit accepts a delayed legal burst but rejects sustained excess speed',async()=>{
  const g=await fixture();try{const a=await client(g.url);a.send({type:'create'});const seat=await a.wait('seat'),room=g.rooms.get(seat.code)!,state=room.seats.get(seat.id)!;state.moveAt=Date.now()-1000;
    a.ws.send(encodeInput({type:'input',seq:1,x:2,z:7.3,facing:Math.PI/2,held:false}));await new Promise(r=>setTimeout(r,80));assert.equal(room.sim.entities[0].x,2);
    a.ws.send(encodeInput({type:'input',seq:2,x:7,z:7.3,facing:Math.PI/2,held:false}));await a.wait('correction');assert.equal(room.sim.entities[0].x,2);
  }finally{await g.close();}
});
test('in-flight movement cannot move a frozen character and does not cause a correction storm',async()=>{
  const g=await fixture();try{const a=await client(g.url);a.send({type:'create'});const seat=await a.wait('seat'),room=g.rooms.get(seat.code)!,e=room.sim.entities[0],x=e.x;e.frozenUntil=room.sim.now+2;
    for(let seq=1;seq<=4;seq++)a.ws.send(encodeInput({type:'input',seq,x:x+seq*.1,z:e.z,facing:0,held:false}));await new Promise(r=>setTimeout(r,160));assert.equal(e.x,x);assert.equal(a.messages.filter(m=>m.type==='correction').length,0);
    e.frozenUntil=0;a.ws.send(encodeInput({type:'input',seq:5,x:12,z:-8,facing:0,held:false}));await a.wait('correction');assert.equal(e.x,x);
  }finally{await g.close();}
});
test('automatic retry cannot crash a room whose final seat has expired',async()=>{
  const g=await fixture();try{
    const a=await client(g.url);a.send({type:'create'});const seat=await a.wait('seat'),room=g.rooms.get(seat.code)!;
    room.seats.clear();room.sim.phase='results';room.resultWall=Date.now()-4100;
    await new Promise(r=>setTimeout(r,150));
    const b=await client(g.url);b.send({type:'create'});await b.wait('seat');assert.equal(g.rooms.size,2);assert.equal(room.sim.entities.length,1);
  }finally{await g.close();}
});
test('an action arriving before the catch is drawn queues retry and restarts in under2.5 seconds',async()=>{
  const g=await fixture();try{
    const a=await client(g.url);a.send({type:'create'});const seat=await a.wait('seat'),room=g.rooms.get(seat.code)!,oldRun=room.solo!.runId;
    room.sim.phase='results';const started=Date.now(),e=room.sim.entities[0];a.send({type:'input',seq:1,x:e.x,z:e.z,facing:0,held:true,lunge:true});await a.wait('retryQueued');
    while((await a.wait('snapshot')).snapshot.solo.runId===oldRun){}
    assert.ok(Date.now()-started<2500);assert.equal(room.sim.phase,'playing');assert.equal(room.sim.entities[0].role,'kid');
  }finally{await g.close();}
});
test('joining ends solo harmlessly, countdown starts a filled round, infection and rotated rematch preserve scores',async()=>{
  const g=await fixture();try{
    const a=await client(g.url);a.send({type:'create',name:'Alex'});const first=await a.wait('seat');
    const b=await client(g.url);b.send({type:'join',code:first.code,name:'Riley'});const second=await b.wait('seat'),room=g.rooms.get(first.code)!;
    assert.equal(second.snapshot.entities.find((e:any)=>e.id===second.id).role,'kid');assert.equal(room.multi!.stage,'joining');assert.equal(room.solo,undefined);
    room.multi!.deadline=Date.now()-1;await new Promise(r=>setTimeout(r,80));assert.equal(room.sim.entities.length,4);assert.equal(room.multi!.stage,'countdown');
    room.multi!.deadline=Date.now()-1;await new Promise(r=>setTimeout(r,80));assert.equal(room.multi!.stage,'playing');
    const starter=room.multi!.startingGeese[0],goose=room.sim.entities.find(e=>e.id===starter)!,kid=room.sim.entities.find(e=>!e.bot&&e.role==='kid')!;
    goose.safeUntil=0;goose.x=kid.x=10;goose.z=kid.z=7;
    await new Promise(r=>setTimeout(r,140));assert.equal(kid.role,'goose');assert.ok(goose.score>=400);assert.ok(kid.frozenUntil>room.sim.now);assert.ok(kid.safeUntil>room.sim.now);
    room.sim.elapsed=74.99;await new Promise(r=>setTimeout(r,80));assert.equal(room.multi!.stage,'results');const total=room.multi!.scores.get(starter)!.total;assert.ok(total>=400);
    room.multi!.deadline=Date.now()-1;await new Promise(r=>setTimeout(r,80));assert.equal(room.multi!.round,2);assert.notEqual(room.multi!.startingGeese[0],starter);assert.equal(room.multi!.scores.get(starter)!.total,total);
  }finally{await g.close();}
});
