import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGameServer } from '../server/index.js';
import { HIDING_SPOTS } from '../shared/round.js';
import { FOOTPRINT_LIFE_MS, MAX_FOOTPRINTS, groundBeamStrength, groundHeight, streetRoute, trueCluePool } from '../shared/trails.js';
import { legalStreetMove } from '../shared/street-layout.js';
import type { ClientRequest, RoomSnapshot, ServerMessage } from '../shared/protocol.js';
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve,ms));
async function until(predicate: () => boolean, message: string, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (predicate()) return; await wait(10); }
  assert.ok(predicate(), message);
}
async function fixture(overrides: Parameters<typeof createGameServer>[0] = {}) {
  const game = createGameServer({roundDurations:{blackoutMs:0,hidingMs:30_000,seekingMs:5_000},clueIntervalMs:150,clueChoiceMs:100,...overrides});
  await new Promise<void>(resolve=>game.server.listen(0,'127.0.0.1',resolve));
  const address=game.server.address(); assert.ok(address&&typeof address!=='string');
  async function client() {
    const socket=new WebSocket(`ws://127.0.0.1:${address.port}/live`),messages:ServerMessage[]=[];
    socket.on('message',data=>messages.push(JSON.parse(data.toString()))); await new Promise<void>(resolve=>socket.once('open',resolve)); let count=0;
    const room=()=>{ const message=[...messages].reverse().find(m=>m.type==='room'); assert.ok(message?.type==='room'); return message.room; };
    async function request(body:Omit<ClientRequest,'id'>) {
      const id=String(++count); socket.send(JSON.stringify({id,...body}));
      const deadline=Date.now()+15_000;
      while(Date.now()<deadline) { const response=messages.find(m=>m.type==='result'&&m.id===id); if(response?.type==='result') return response; await wait(5); } throw Error('request timeout');
    }
    return {socket,messages,room,request};
  }
  return {game,client};
}
test('all possible clue selections stay true and preserve at least two hiding spots',()=>{
  for(const spot of HIDING_SPOTS) {
    const pool=trueCluePool(spot); assert.ok(pool.length>=3);
    assert.ok(pool.every(clue=>clue.candidates.includes(spot.id)));
    const intersection=HIDING_SPOTS.filter(candidate=>pool.every(clue=>clue.candidates.includes(candidate.id)));
    assert.ok(intersection.length>=2,spot.id+' cannot be uniquely identified by clues');
  }
});
test('human clue choices are private, truthful and fall back automatically; beam freeze rejects movement',async()=>{
  const {game,client}=await fixture({roundDurations:{blackoutMs:0,hidingMs:0,seekingMs:60_000}});
  try {
    const a=await client(),b=await client(),created=await a.request({type:'create',name:'Alex'}); assert.ok(created.ok&&created.seat&&created.room);
    await b.request({type:'join',name:'Sam',code:created.room.code}); await a.request({type:'start'});
    await until(()=>a.room().round?.phase==='seeking'&&b.room().round?.phase==='seeking','Both players enter seeking');
    const early=b.messages.filter(m=>m.type==='room'); assert.ok(early.every(m=>!JSON.stringify(m).includes('clueOffer')));
    await until(()=>a.room().round?.clues?.length===3&&b.room().round?.clues?.length===3,'All three clue deadlines deliver on both sockets');
    const capsule=HIDING_SPOTS.find(spot=>spot.id===a.room().round?.capsuleSpotId)!;
    assert.ok(b.room().round!.clues!.every(clue=>trueCluePool(capsule).some(option=>option.text===clue.text)));
    let pose=a.room().players.find(p=>p.role==='hider')!;
    for(const target of [{x:pose.x,z:4},{x:-2.4,z:4}]) {
      for(let i=0;i<10&&Math.hypot(pose.x-target.x,pose.z-target.z)>.01;i++) {
        await wait(210); const d=Math.hypot(target.x-pose.x,target.z-pose.z),t=Math.min(1,.7/d);
        const sentSeq=pose.seq+1;
        a.socket.send(JSON.stringify({id:'move',type:'move',x:pose.x+(target.x-pose.x)*t,z:pose.z+(target.z-pose.z)*t,facing:0,seq:sentSeq}));
        await until(()=>a.room().players.find(p=>p.role==='hider')!.seq>=sentSeq,'Accepted hider movement is broadcast'); pose=a.room().players.find(p=>p.role==='hider')!;
      }
    }
    // Seekers initially face north; turn south onto the hider's feet.
    const seeker=b.room().players.find(p=>p.role==='seeker')!;
    b.socket.send(JSON.stringify({id:'turn',type:'move',x:seeker.x,z:seeker.z,facing:0,seq:seeker.seq+1}));
    await until(()=>{ const hider=a.room().players.find(p=>p.role==='hider')!; return (hider.frozenUntil??0)>Date.now()&&b.room().players.find(p=>p.id===hider.id)?.frozenUntil===hider.frozenUntil; },'Both sessions agree on a current freeze');
    pose=a.room().players.find(p=>p.role==='hider')!; assert.ok((pose.frozenUntil??0)>Date.now());
    assert.equal(b.room().players.find(p=>p.id===pose.id)?.frozenUntil,pose.frozenUntil);
    const before=a.messages.length; a.socket.send(JSON.stringify({id:'frozen-move',type:'move',x:pose.x+.1,z:pose.z,facing:0,seq:pose.seq+1}));
    await until(()=>a.messages.slice(before).some(m=>m.type==='pose_rejected'),'A translation sent during freeze is rejected');
    assert.ok(a.messages.slice(before).some(m=>m.type==='pose_rejected'));
    assert.ok((pose.immunityUntil??0)-(pose.frozenUntil??0)===5_000);
    assert.ok(a.room().round!.footprints!.some(step=>step.fadeAt===step.expiresAt-FOOTPRINT_LIFE_MS));
  }finally{await game.close();}
});
test('computer burial routes remain collision-valid and beam mask uses exact shared cone',()=>{
  for(const spot of HIDING_SPOTS) { const path=streetRoute({x:-4,z:2},spot); assert.ok(path.length>2); assert.ok(path.slice(1).every((point,i)=>legalStreetMove(path[i],point)),spot.id); assert.deepEqual(path.at(-1),{x:spot.x,z:spot.z}); }
  assert.ok(groundBeamStrength({x:0,z:4},{x:0,z:0,facing:0})>.9);
  assert.equal(groundBeamStrength({x:0,z:-4},{x:0,z:0,facing:0}),0);
  assert.equal(groundBeamStrength({x:4,z:4},{x:0,z:0,facing:0}),0);
  assert.equal(groundHeight(0,2),-.055);
  assert.equal(groundHeight(-7.8,-6.55),.02);
  assert.equal(groundHeight(-6,-8),-.025);
  assert.equal(groundHeight(-4.1,-8),.045);
  assert.equal(groundHeight(-9,-10),.115);
});
test('solo snapshots publish bounded indistinguishable trails and marks, scheduled clues, then reveal only at timeout',async()=>{
  const {game,client}=await fixture();
  try {
    const a=await client(),created=await a.request({type:'create',name:'Alex'}); assert.ok(created.ok&&created.seat);
    await a.request({type:'start'}); let pose=a.room().players[0];
    for(const target of [{x:0,z:0},{x:0,z:-1}]) {
      while(Math.hypot(pose.x-target.x,pose.z-target.z)>.01) { await wait(210); const distance=Math.hypot(target.x-pose.x,target.z-pose.z),t=Math.min(1,.7/distance),sentSeq=pose.seq+1; a.socket.send(JSON.stringify({id:'move',type:'move',x:pose.x+(target.x-pose.x)*t,z:pose.z+(target.z-pose.z)*t,facing:Math.PI,seq:sentSeq})); await until(()=>a.room().players[0].seq>=sentSeq,'Accepted preparation movement is broadcast'); pose=a.room().players[0]; }
    }
    const pickup=await a.request({type:'pickup',roundNumber:1}); assert.ok(pickup.ok&&pickup.room?.round); const round=pickup.room.round;
    assert.equal(round.capsuleSpotId,undefined); assert.equal(round.marks?.length,4);
    assert.ok(round.footprints!.length>20&&round.footprints!.length<=MAX_FOOTPRINTS);
    assert.ok(round.footprints!.every(step=>step.fadeAt===round.seekingStartedAt&&step.expiresAt-step.fadeAt===FOOTPRINT_LIFE_MS));
    assert.ok(round.marks!.every(mark=>Object.keys(mark).sort().join(',')==='createdAt,id,x,z'));
    assert.ok(round.footprints!.every(step=>Object.keys(step).sort().join(',')==='expiresAt,facing,fadeAt,id,x,z'));
    await until(()=>a.room().round?.clues?.length===3,'Solo receives all three scheduled clues');
    const before=a.messages.filter(m=>m.type==='room'||m.type==='result'&&m.ok&&m.room); assert.ok(before.every(m=>!JSON.stringify(m).includes('capsuleSpotId')));
    await until(()=>a.room().round?.phase==='reveal','Server seeking deadline reveals the solo capsule'); const revealed=a.room().round; assert.equal(revealed?.phase,'reveal'); const spot=HIDING_SPOTS.find(s=>s.id===revealed?.capsuleSpotId)!;
    const trueTexts=trueCluePool(spot).map(clue=>clue.text); assert.ok(revealed.clues!.every(clue=>trueTexts.includes(clue.text)));
  }finally{await game.close();}
});


test('hiding prints follow actual accepted movement during the lit lead-in without inventing a later jump',async()=>{
  const {game,client}=await fixture({roundDurations:{blackoutMs:5000,hidingMs:30000,seekingMs:60000}});
  try{
    const hider=await client(),seeker=await client(),created=await hider.request({type:'create',name:'Alex'});assert.ok(created.ok&&created.room);
    await seeker.request({type:'join',code:created.room.code,name:'Sam'});await hider.request({type:'start'});
    await until(()=>hider.room().round?.phase==='hiding','Hiding starts before blackout');
    const pose=hider.room().players.find(player=>player.role==='hider')!;await wait(210);
    hider.socket.send(JSON.stringify({id:'lead-in-move',type:'move',x:pose.x+.7,z:pose.z,facing:Math.PI/2,seq:pose.seq+1,path:[{x:pose.x+.7,z:pose.z}]}));
    await until(()=>hider.room().players.find(player=>player.id===pose.id)!.seq>pose.seq,'Lead-in movement accepted');
    const room=hider.room();assert.ok(room.blackoutAt!>room.serverTime);assert.ok(room.round!.footprints!.length>0);
    for(const foot of room.round!.footprints!){assert.equal(foot.z,pose.z);assert.ok(foot.x>pose.x&&foot.x<=pose.x+.7);assert.equal(foot.fadeAt,0);assert.equal(foot.expiresAt,0);}
    assert.equal(seeker.room().round!.footprints,undefined);
  }finally{await game.close();}
});
