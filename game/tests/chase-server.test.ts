import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createChaseServer} from '../server/chase-server.js';
async function fixture(){const g=createChaseServer();await new Promise<void>(r=>g.server.listen(0,'127.0.0.1',r));const port=(g.server.address() as {port:number}).port;return {...g,url:`ws://127.0.0.1:${port}/ws`};}
async function client(url:string){const ws=new WebSocket(url),messages:any[]=[];ws.on('message',m=>messages.push(JSON.parse(m.toString())));await new Promise(r=>ws.once('open',r));return {ws,messages,send:(m:unknown)=>ws.send(JSON.stringify(m)),async wait(type:string){const end=Date.now()+2500;while(Date.now()<end){const index=messages.findIndex(m=>m.type===type);if(index>=0)return messages.splice(index,1)[0];await new Promise(r=>setTimeout(r,10));}throw new Error(`Missing ${type}`);}};}
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
