import {chromium} from '@playwright/test';
import {WebSocket} from 'ws';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
const browser=await chromium.launch({args:process.platform==='win32'?['--use-angle=d3d11']:[]});
const clients=[];
try{
  const contexts=await Promise.all([{width:667,height:375},{width:1366,height:768}].map(viewport=>browser.newContext({viewport})));
  const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));
  // Renderer-only full-cap stress: real six-player room, synthetic public trace arrays.
  for(const context of contexts)await context.addInitScript(()=>{
    const Native=window.WebSocket;
    window.WebSocket=class extends Native {
      set onmessage(handler){super.onmessage=event=>{
        const message=JSON.parse(event.data),room=message.room;
        if(room?.round?.phase==='seeking'){
          const start=room.round.seekingStartedAt;
          room.round.footprints=Array.from({length:256},(_,i)=>({id:`budget-${i}`,x:-6+(i%32)*.35,z:-1+Math.floor(i/32)*.4,facing:Math.PI/2,fadeAt:start,expiresAt:start+60000}));
          room.round.marks=Array.from({length:4},(_,i)=>({id:`budget-mark-${i}`,x:-2+i*1.5,z:1,createdAt:room.startedAt}));
        }
        if(handler)handler.call(this,{data:JSON.stringify(message)});
      };}
      get onmessage(){return super.onmessage;}
    };
  });
  await a.goto('http://localhost:5174/');await a.getByLabel('Your name').fill('Alex');await a.getByRole('button',{name:'Create a night',exact:true}).click();await a.getByTestId('room-code').waitFor();const code=await a.getByTestId('room-code').innerText();
  await b.goto(`http://localhost:5174/?room=${code}`);await b.getByLabel('Your name').fill('Sam');await b.getByRole('button',{name:'Join',exact:true}).click();await b.getByRole('list',{name:'Players'}).waitFor();
  for(let index=2;index<6;index++){
    const socket=new WebSocket('ws://localhost:5174/live');clients.push(socket);await new Promise(resolve=>socket.once('open',resolve));
    await new Promise(resolve=>{socket.on('message',bytes=>{const m=JSON.parse(bytes);if(m.type==='result'&&m.id==='join'){assert(m.ok);socket.playerId=m.seat.playerId;socket.pose=m.room.players.find(p=>p.id===socket.playerId);resolve();}if(m.type==='room')socket.pose=m.room.players.find(p=>p.id===socket.playerId)??socket.pose;});socket.send(JSON.stringify({id:'join',type:'join',code,name:`Friend ${index+1}`}));});
  }
  await a.getByRole('button',{name:'Start the night',exact:true}).click();for(const p of [a,b])await p.locator('canvas[data-ready="true"]').waitFor();
  // The fixed hiding deadline admits the five seekers; bots use the same flow.
  await b.waitForTimeout(600);
  const prepMetrics=await b.locator('canvas').evaluate(c=>({triangles:Number(c.dataset.triangles),drawCalls:Number(c.dataset.drawCalls),fps:Number(c.dataset.fps)}));
  await a.locator('canvas[data-round-phase="seeking"]').waitFor({timeout:45000});
  await b.keyboard.down('d');await b.waitForTimeout(50);await b.keyboard.up('d');
  clients.forEach((s,i)=>s.send(JSON.stringify({id:'face',type:'move',x:s.pose.x,z:s.pose.z,facing:i===0?Math.PI/2:i*Math.PI/2,seq:s.pose.seq+1})));
  const samples=[];
  for(let index=0;index<15;index++){
    await new Promise(resolve=>setTimeout(resolve,2000));
    samples.push(await Promise.all([a,b].map(p=>p.locator('canvas').evaluate(c=>({fps:Number(c.dataset.fps),p95:Number(c.dataset.frameP95),triangles:Number(c.dataset.triangles),drawCalls:Number(c.dataset.drawCalls),shadowLights:Number(c.dataset.shadowLights),characterHeight:Number(c.dataset.characterHeight),footprints:Number(c.dataset.footprintsReceived),marks:Number(c.dataset.marksReceived),players:Object.keys(JSON.parse(c.dataset.playerposes)).length})))));
  }
  const hardware={cpu:os.cpus()[0]?.model,platform:os.platform(),browser:browser.version(),gpu:await a.locator('canvas').evaluate(c=>{const gl=c.getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';})};
  const result={stress:"real six-player room; client-only injected 256 public footprints and four marks",hardware,prepMetrics,playerCount:6,durationMs:30000,devices:samples[0].map((_,i)=>({viewport:i===0?'667x375':'1366x768',medianFps:samples.map(s=>s[i].fps).sort((a,b)=>a-b)[7],maxTriangles:Math.max(...samples.map(s=>s[i].triangles)),maxDrawCalls:Math.max(...samples.map(s=>s[i].drawCalls)),shadowLights:samples[0][i].shadowLights,characterHeight:samples[0][i].characterHeight,frameP95Ms:samples.at(-1)[i].p95})),samples};
  await writeFile(`../design/${process.argv[2]==='step6'?'step6':'step5'}-six-player-metrics.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result.devices));
  for(const device of result.devices){assert(device.maxTriangles<100000);assert(device.maxDrawCalls<100);assert(device.shadowLights<=2);assert(device.medianFps>=30);}
}finally{for(const client of clients)client.close();await browser.close();}
