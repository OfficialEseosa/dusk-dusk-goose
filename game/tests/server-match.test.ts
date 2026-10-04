import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { HIDING_SPOTS } from '../shared/round.js';
import type { ClientRequest, RoomSnapshot, ServerMessage } from '../shared/protocol.js';
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate:()=>boolean,timeout=5000){const end=Date.now()+timeout;while(!predicate()){assert.ok(Date.now()<end,'Timed out waiting for authoritative state');await wait(5);}}
async function fixture(){
 const game=createGameServer({roundDurations:{blackoutMs:0,hidingMs:40,seekingMs:180,revealMs:30,nextRoundMs:200},heartbeatMs:200});
 await new Promise<void>(resolve=>game.server.listen(0,'127.0.0.1',resolve));const address=game.server.address();assert.ok(address&&typeof address!=='string');
 async function client(){const socket=new WebSocket(`ws://127.0.0.1:${address.port}/live`),messages:ServerMessage[]=[];socket.on('message',bytes=>messages.push(JSON.parse(bytes.toString())));await new Promise<void>(resolve=>socket.once('open',resolve));let seq=0;
 const room=()=>{const latest=[...messages].reverse().find(m=>m.type==='room'||m.type==='result'&&m.ok&&m.room);assert.ok(latest&&'room'in latest&&latest.room);return latest.room;};
 async function request(body:Omit<ClientRequest,'id'>){const id=String(++seq);socket.send(JSON.stringify({id,...(body.type === 'play_again' ? { roundNumber: room().round?.number } : {}),...body}));await until(()=>messages.some(m=>m.type==='result'&&m.id===id));return messages.find(m=>m.type==='result'&&m.id===id) as Extract<ServerMessage,{type:'result'}>;}
 return {socket,messages,request,room};}
 return {game,client};
}
test('solo completes three server-owned rounds, restores final scoreboard and replay creates a fresh match',async()=>{
 const {game,client}=await fixture();try{const a=await client();const created=await a.request({type:'create',name:'Alex'});assert.ok(created.ok&&created.seat);await a.request({type:'start'});const first=a.room().match!.id;
 await until(()=>a.room().match?.phase==='finished');assert.equal(a.room().match?.roundNumber,3);assert.equal(a.room().match?.totalRounds,3);assert.equal(a.room().match?.scores[0].score,0);assert.deepEqual(a.room().match?.winnerIds,[created.seat.playerId]);
 const forged=await a.request({type:'search_complete',spotId:HIDING_SPOTS[0].id,roundNumber:a.room().round!.number});assert.equal(forged.ok,false);await a.request({type:'start'});assert.equal(a.room().match?.id,first);assert.equal(a.room().match?.phase,'finished');
 const resumed=await client();const recovered=await resumed.request({type:'resume',code:created.seat.room,token:created.seat.token});assert.ok(recovered.ok&&recovered.room);assert.deepEqual(recovered.room.match,a.room().match);
 const replay=await resumed.request({type:'play_again'});assert.ok(replay.ok&&replay.room);assert.notEqual(replay.room.match?.id,first);assert.equal(replay.room.match?.roundNumber,1);assert.equal(replay.room.match?.scores[0].score,0);assert.equal(replay.room.round?.number,4);
 await until(()=>resumed.room().match?.phase==='finished');const secondFinalId=resumed.room().match!.id;
 const delayed=await resumed.request({type:'play_again',roundNumber:3});assert.ok(!delayed.ok&&delayed.error.code==='stale_round');assert.equal(resumed.room().match!.id,secondFinalId);assert.equal(resumed.room().match!.phase,'finished');
 const missing=await resumed.request({type:'play_again',roundNumber:undefined});assert.ok(!missing.ok&&missing.error.code==='stale_round');assert.equal(resumed.room().match!.id,secondFinalId);
 }finally{await game.close();}
});
test('two players alternate four rounds, agree on scores, auto-advance and either player may replay',async()=>{
 const {game,client}=await fixture();try{const a=await client(),b=await client();const created=await a.request({type:'create',name:'Alex'});assert.ok(created.ok&&created.seat);const joined=await b.request({type:'join',name:'Sam',code:created.seat.room});assert.ok(joined.ok&&joined.seat);await a.request({type:'start'});
 await until(()=>a.room().match?.phase==='finished');await until(()=>b.room().match?.phase==='finished');const starts=a.messages.filter(m=>m.type==='room'&&m.room.round?.phase==='hiding').map(m=>(m as {room:RoomSnapshot}).room.round!);const unique=[...new Map(starts.map(r=>[r.number,r])).values()];assert.deepEqual(unique.map(r=>r.hiderId),[created.seat.playerId,joined.seat.playerId,created.seat.playerId,joined.seat.playerId]);assert.deepEqual(a.room().match,b.room().match);assert.deepEqual(a.room().match!.scores.map(s=>s.score),[2,2]);
 const replay=await b.request({type:'play_again'});assert.ok(replay.ok&&replay.room?.match?.roundNumber===1);assert.equal(replay.room?.round?.hiderId,created.seat.playerId);
 }finally{await game.close();}
});
test('late joins reset the announced scoring cycle and removing the next hider does not stall',async()=>{
 const {game,client}=await fixture();try{const a=await client(),b=await client();const created=await a.request({type:'create',name:'Alex'});assert.ok(created.ok&&created.seat);await a.request({type:'start'});const old=a.room().match!.id;
 const joined=await b.request({type:'join',name:'Sam',code:created.seat.room});assert.ok(joined.ok&&joined.seat&&joined.room?.players.find(p=>p.id===joined.seat!.playerId)?.role==='waiting');await until(()=>a.room().match?.id!==old);assert.equal(a.room().match!.totalRounds,4);assert.equal(a.room().match!.roundNumber,1);assert.match(a.room().match!.announcement,/group changed/i);assert.equal(a.room().round!.hiderId,created.seat.playerId);assert.ok(a.room().match!.scores.every(s=>s.score===0));
 await b.request({type:'leave'});const before=a.room().match!.id;await until(()=>a.room().match?.id!==before);assert.equal(a.room().match!.solo,true);assert.equal(a.room().match!.totalRounds,3);await until(()=>a.room().match?.phase==='finished');
 }finally{await game.close();}
});
test('sixty solo rounds put the real disturbed mark in every list position without a labelled trail or mark',async()=>{
 const {game,client}=await fixture();const ranks=[0,0,0,0];let reorderedFootprints=0;
 try{for(let match=0;match<20;match++){const a=await client();await a.request({type:'create',name:'Alex'});await a.request({type:'start'});await until(()=>a.room().match?.phase==='finished');
 for(let number=1;number<=3;number++){const projected=a.messages.filter(m=>m.type==='room'&&m.room.round?.number===number&&m.room.round.phase==='seeking').map(m=>(m as {room:RoomSnapshot}).room.round!);const reveal=a.messages.find(m=>m.type==='room'&&m.room.round?.number===number&&m.room.round.phase==='reveal');assert.ok(reveal?.type==='room'&&projected.length);const spot=HIDING_SPOTS.find(s=>s.id===reveal.room.round!.capsuleSpotId)!;const first=projected[0];const rank=first.marks!.findIndex(m=>m.x===spot.x&&m.z===spot.z);assert.ok(rank>=0);ranks[rank]++;
 assert.ok(projected.every(r=>!('capsuleSpotId'in r)&&r.marks!.every(m=>Object.keys(m).sort().join(',')==='createdAt,id,x,z')&&r.footprints!.every(m=>Object.keys(m).sort().join(',')==='expiresAt,facing,fadeAt,id,x,z')));
 if(projected.length>1&&projected[0].footprints?.[0]?.id!==projected[1].footprints?.[0]?.id)reorderedFootprints++;
 }await a.request({type:'leave'});a.socket.close();}
 assert.ok(ranks.every(count=>count>=3),`Real mark rank counts over sixty rounds: ${ranks}`);assert.ok(reorderedFootprints>=40,`Public footprint order varies without changing trail contents: ${reorderedFootprints}`);console.log('Privacy sampling: real mark rank counts',ranks,'footprint lists reordered',reorderedFootprints);
 }finally{await game.close();}
});

test('three through six players each receive one hider turn and a disconnected seat cannot pause the match',async()=>{
 for(const count of [3,4,5,6]){const {game,client}=await fixture();try{const players=[];for(let i=0;i<count;i++)players.push(await client());const created=await players[0].request({type:'create',name:'Player 1'});assert.ok(created.ok&&created.seat);const ids=[created.seat.playerId];for(let i=1;i<count;i++){const joined=await players[i].request({type:'join',name:`Player ${i+1}`,code:created.seat.room});assert.ok(joined.ok&&joined.seat);ids.push(joined.seat.playerId);}await players[0].request({type:'start'});await until(()=>players[0].room().match?.phase==='finished',6000);const starts=players[0].messages.filter(m=>m.type==='room'&&m.room.round?.phase==='hiding').map(m=>(m as {room:RoomSnapshot}).room.round!);const unique=[...new Map(starts.map(r=>[r.number,r])).values()];assert.deepEqual(unique.map(r=>r.hiderId),ids);assert.equal(players[0].room().match!.totalRounds,count);assert.ok(players[0].room().match!.scores.every(s=>s.score===1));
 }finally{await game.close();}}
 const {game,client}=await fixture();try{const a=await client(),b=await client();const created=await a.request({type:'create',name:'Alex'});assert.ok(created.ok&&created.seat);await b.request({type:'join',name:'Sam',code:created.seat.room});await a.request({type:'start'});b.socket.terminate();await until(()=>a.room().match?.phase==='finished');assert.equal(a.room().match!.totalRounds,4);assert.equal(a.room().match!.phase,'finished');}finally{await game.close();}
});
test('between-round reconnect keeps scores and a device cannot inject points or force the next round',async()=>{
 const {game,client}=await fixture();try{const a=await client(),b=await client();const created=await a.request({type:'create',name:'Alex'});assert.ok(created.ok&&created.seat);const joined=await b.request({type:'join',name:'Sam',code:created.seat.room});assert.ok(joined.ok&&joined.seat);await a.request({type:'start'});await until(()=>b.room().round?.phase==='reveal');const score=b.room().match!.scores;const epoch=b.room().round!.number;
 const forged=await b.request({type:'start',score:999999,roundNumber:9999} as Omit<ClientRequest,'id'>);assert.equal(forged.ok,false);assert.deepEqual(b.room().match!.scores,score);const replay=await b.request({type:'play_again'});assert.equal(replay.ok,false);assert.equal(b.room().round!.number,epoch);
 const resumed=await client();const reply=await resumed.request({type:'resume',code:created.seat.room,token:joined.seat.token});assert.ok(reply.ok&&reply.room);assert.equal(reply.room.round!.phase,'reveal');assert.deepEqual(reply.room.match!.scores,score);
 }finally{await game.close();}
});
