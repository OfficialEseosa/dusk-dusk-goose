import * as THREE from 'three';
import {PARK,TUNE,slide,tonightSeed,distance,type ChaseSnapshot,type Entity} from '../shared/chase';
import {readBest,saveBest,recordRun,torchReward,formatTime} from './chase-best';
import './chase-style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<canvas aria-label="The Park"></canvas><div id="shade"></div>
<main id="title"><h1>Dusk Dusk<br><em>Goose.</em></h1><p>The dark has a funny way of finding you.</p><p>Run. Hold your light. Don't become a goose.</p><div class="entry"><input id="name" aria-label="Your name" placeholder="Your name" maxlength="16" value="Kid"><button id="play">Play</button></div><div class="entry"><input id="code" aria-label="Room code" placeholder="Room code" maxlength="5"><button id="join">Join friends</button></div><p id="notice" role="status">1–6 friends · No login · WASD + Space</p></main>
<header id="hud" hidden><div><b id="room"></b><span id="invite">Invite a friend with this code</span></div><div id="clock"><b id="timer">0:00</b><span id="best">BEST 0:00</span></div><div><span id="count"></span><span id="hour">HOUR 1</span></div></header>
<div id="threat" hidden>→ GOOSE</div><div id="message" role="status"></div><section id="results" hidden><h2 id="result-title">The geese got you!</h2><p id="survived"></p><p id="reward"></p><p id="result-invite"></p><p id="retry-hint"></p></section>
<div id="controls" hidden><div id="stick" aria-label="Move"><span></span><b>MOVE</b></div><button id="action"><span id="action-icon">☀</span><span id="action-label">LIGHT</span><span id="action-state">100%</span></button></div>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=app.querySelector('canvas')!;
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();scene.background=new THREE.Color('#25365e');scene.fog=new THREE.FogExp2('#25365e',.014);
const camera=new THREE.PerspectiveCamera(40,1,.1,100);scene.add(new THREE.HemisphereLight('#a9c5ff','#355e57',2.3));const moon=new THREE.DirectionalLight('#b9ccff',2);moon.position.set(-12,20,8);scene.add(moon);
const mat=(color:string)=>new THREE.MeshLambertMaterial({color,flatShading:true});
const ground=new THREE.Mesh(new THREE.BoxGeometry(32,.2,24),mat('#3f775f'));ground.position.y=-.15;scene.add(ground);
for(const s of PARK.solids){const mesh=new THREE.Mesh(new THREE.BoxGeometry(s.w,1.2,s.d),mat('#356b60'));mesh.position.set(s.x,.6,s.z);scene.add(mesh);}
const edge=new THREE.Mesh(new THREE.BoxGeometry(26,.05,18),mat('#4c8471'));edge.position.y=-.02;scene.add(edge);
const models=new Map<string,THREE.Group>();const beams=new Map<string,THREE.SpotLight>();const batteries:THREE.Mesh[]=[];
for(let i=0;i<2;i++){const m=new THREE.Mesh(new THREE.CylinderGeometry(.3,.3,.6,8),mat('#ffc83d'));scene.add(m);batteries.push(m);}
function model(e:Entity){const root=new THREE.Group();const material=mat(e.role==='kid'?'#ffbd43':'#d9e5ed');
  if(e.role==='kid'){const body=new THREE.Mesh(new THREE.CapsuleGeometry(.42,.65,3,6),material);body.position.y=1;root.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.37,8,6),mat('#efb48a'));head.position.y=1.85;root.add(head);}
  else {const body=new THREE.Mesh(new THREE.SphereGeometry(.5,10,6),material);body.scale.set(1,.8,1.5);body.position.y=.65;root.add(body);const neck=new THREE.Mesh(new THREE.CylinderGeometry(.15,.2,.85,6),material);neck.position.set(0,1.1,.4);root.add(neck);const head=new THREE.Mesh(new THREE.SphereGeometry(.24,8,6),material);head.position.set(0,1.6,.4);root.add(head);const beak=new THREE.Mesh(new THREE.ConeGeometry(.14,.4,4),mat('#ff8a1f'));beak.rotation.x=Math.PI/2;beak.position.set(0,1.58,.72);root.add(beak);for(const x of [-.2,.2]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.07,6,4),new THREE.MeshBasicMaterial({color:'#ff3966'}));eye.position.set(x,1.7,.54);root.add(eye);}}
  root.userData.role=e.role;root.scale.setScalar(1.35);scene.add(root);models.set(e.id,root);
  let beam=beams.get(e.id);if(!beam){beam=new THREE.SpotLight('#ffe2a8',0,10,Math.PI/9,.5,1);scene.add(beam,beam.target);beams.set(e.id,beam);}return root;
}
let snapshot:ChaseSnapshot|undefined,id='',token='',roomCode='',bootId='',ws:WebSocket|undefined;
let local={x:-4,z:6},seq=0,held=false,lunge=false,lastSend=0,lastMessage=0,retryAt=0,autoResume=true;
let best=readBest(),runId='',runBest=best.time,newBestShown=false,lastBestSecond=-1,lastEventId=0,messageUntil=0,firstMove=false,firstFreeze=false;
el('notice').textContent=`Tonight's park · ${String(tonightSeed()).slice(4,6)}/${String(tonightSeed()).slice(6)} · WASD + Space`;
const keys=new Set<string>();let stickX=0,stickZ=0,pointer:number|undefined,origin={x:0,y:0};
let credential:any;try{credential=JSON.parse(sessionStorage.getItem('ddg-seat')??'null');}catch{}
function send(m:unknown){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));}
function connect(intent?:'create'|'join'){
  if(ws)ws.close();const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);ws=socket;
  socket.onopen=()=>{lastMessage=performance.now();if(credential&&!intent&&autoResume)send({type:'resume',...credential});else if(intent)send({type:intent,code:el<HTMLInputElement>('code').value.trim().toUpperCase(),name:el<HTMLInputElement>('name').value.trim()||'Kid',beginner:best.runs===0});};
  socket.onmessage=event=>{if(ws!==socket)return;lastMessage=performance.now();const m=JSON.parse(event.data);
    if(m.type==='seat'){id=m.id;token=m.token;roomCode=m.code;bootId=m.bootId;credential={token,code:roomCode,bootId};sessionStorage.setItem('ddg-seat',JSON.stringify(credential));local={...m.snapshot.entities.find((e:Entity)=>e.id===id)};seq=m.nextSeq;el('title').hidden=true;el('controls').hidden=false;el('hud').hidden=false;apply(m.snapshot);}
    if(m.type==='snapshot')apply(m.snapshot);
    if(m.type==='correction'){local.x=m.x;local.z=m.z;}
    if(m.type==='retryQueued')flash('Next chase queued!',.7);
    if(m.type==='error'){el('notice').textContent=m.message;}
    if(m.type==='ended'||m.type==='displaced'){autoResume=false;credential=null;sessionStorage.removeItem('ddg-seat');snapshot=undefined;el('title').hidden=false;el('controls').hidden=true;el('hud').hidden=true;el('results').hidden=true;el('notice').textContent=m.message??'Your seat continued in another tab.';}
  };
  socket.onclose=()=>{if(ws===socket&&credential&&autoResume){el('message').textContent='Reconnecting…';setTimeout(()=>connect(),500);}};
}
function flash(message:string,seconds=1.4){el('message').textContent=message;messageUntil=performance.now()+seconds*1000;}
function apply(s:ChaseSnapshot){const was=snapshot;snapshot=s;const me=s.entities.find(e=>e.id===id);if(!me)return;
  const fresh=!!s.solo&&runId!==s.solo.runId;
  if(fresh){runId=s.solo!.runId;runBest=best.time;newBestShown=false;lastBestSecond=-1;lastEventId=0;firstMove=false;firstFreeze=false;held=false;lunge=false;flash('Move left. Hold LIGHT when the goose comes.',2);el('timer').classList.remove('record');}
  if(!was||fresh||was.phase==='results'&&s.phase==='playing'||me.frozenUntil>s.now||me.role==='goose'&&s.now-me.lungeAt<.84){local.x=me.x;local.z=me.z;}
  const gooseCount=s.entities.filter(e=>e.role==='goose').length;
  el('room').textContent=`ROOM ${s.code}`;el('timer').textContent=formatTime(s.elapsed);el('count').textContent=s.mode==='solo'?`${gooseCount} ${gooseCount===1?'GOOSE':'GEESE'}`:`${s.entities.filter(e=>e.role==='kid').length} KIDS LEFT`;
  el('hour').textContent=`HOUR ${(s.solo?.hour??0)+1}`;el('best').textContent=`BEST ${formatTime(Math.max(best.time,s.elapsed))}`;
  const result=s.phase==='results';
  el('action-icon').textContent=result?'↻':me.role==='kid'?'☀':'➤';el('action-label').textContent=result?'AGAIN':me.role==='kid'?'LIGHT':'LUNGE';
  el('action-state').textContent=result?(s.now<(s.solo?.retryReadyAt??0)?'GET READY':'TAP'):me.role==='kid'?`${Math.ceil(me.battery)}%`:'SPACE';
  el('action').style.setProperty('--charge',`${me.battery}%`);
  if(s.mode==='solo'){
    if(s.phase==='playing'&&s.elapsed>runBest&&s.elapsed>1&&!newBestShown){newBestShown=true;el('timer').classList.add('record');if(runBest>0)flash('NEW BEST!');}
    if(Math.floor(s.elapsed)!==lastBestSecond&&s.elapsed>best.time){best={...best,time:s.elapsed,score:Math.max(best.score,me.score)};saveBest(best);lastBestSecond=Math.floor(s.elapsed);}
    if(result&&s.solo&&best.lastResult!==s.solo.runId){best=recordRun(best,s.solo.runId,s.elapsed,me.score);saveBest(best);}
  }
  const showResults=result&&s.now-(s.solo?.resultAt??s.now)>=.6;
  el('results').hidden=!showResults;el('message').hidden=showResults;
  el('result-title').textContent=s.elapsed>=runBest?'A new personal best!':'The geese got you!';
  el('survived').textContent=`${formatTime(s.elapsed)} survived${runBest>s.elapsed?` · ${Math.ceil(runBest-s.elapsed)}s short of your best`:''}`;
  el('reward').textContent=torchReward(best.time).goal;el('result-invite').textContent=`Add a friend: ${s.code} · Goose next round`;
  el('retry-hint').textContent=s.now<(s.solo?.retryReadyAt??0)?'Tap AGAIN to queue your next chase.':'Tap AGAIN · or let the next chase find you';
  for(const event of s.events){if(event.id<=lastEventId)continue;lastEventId=event.id;
    if(event.type==='freeze'&&event.actor===id){firstFreeze=true;flash('FROZEN! +25 · RUN!');}
    if(event.type==='catch')flash(event.target===id?"You're a goose! HONK.":'CAUGHT!');
    if(event.type==='pickup'&&event.actor===id)flash('+50 BATTERY');
    if(event.type==='hour')flash('+1 HOUR · BATTERY FULL');
    if(event.type==='spawn')flash(`${event.x>=local.x?'→':'←'} ${s.entities.find(e=>e.id===event.actor)?.name.toUpperCase()??'GOOSE'}!`,1);
  }
  const threat=s.entities.find(e=>e.role==='goose'&&distance(e,me)<TUNE.range&&e.immuneUntil<=s.now);
  el('action').classList.toggle('attention',!!threat&&!firstFreeze&&me.role==='kid'&&!result);
  el('threat').hidden=result||!s.entities.some(e=>e.role==='goose'&&distance(e,me)>7);
  const nearest=s.entities.filter(e=>e.role==='goose').sort((a,b)=>distance(a,me)-distance(b,me))[0];if(nearest)el('threat').textContent=`${nearest.x>=me.x?'→':'←'} GOOSE`;
}
el('play').onclick=()=>{autoResume=true;credential=null;connect('create');};el('join').onclick=()=>{autoResume=true;credential=null;connect('join');};
const action=(on:boolean)=>{held=on;if(on&&snapshot?.phase==='results'){send({type:'retry'});return;}if(on)lunge=true;};
el('action').onpointerdown=e=>{e.preventDefault();el('action').setPointerCapture(e.pointerId);action(true);};
el('action').onpointerup=el('action').onpointercancel=()=>action(false);
el('stick').onpointerdown=e=>{if(pointer!==undefined)return;pointer=e.pointerId;origin={x:e.clientX,y:e.clientY};el('stick').setPointerCapture(e.pointerId);};
el('stick').onpointermove=e=>{if(e.pointerId!==pointer)return;const dx=e.clientX-origin.x,dy=e.clientY-origin.y,d=Math.hypot(dx,dy),amount=d<7?0:Math.min(1,d/34);stickX=d?dx/d*amount:0;stickZ=d?dy/d*amount:0;const knob=el('stick').querySelector('span')!;knob.style.transform=`translate(${stickX*38}px,${stickZ*38}px)`;};
el('stick').onpointerup=el('stick').onpointercancel=()=>{pointer=undefined;stickX=stickZ=0;el('stick').querySelector('span')!.style.transform='';};
window.onkeydown=e=>{if((e.target as HTMLElement).tagName==='INPUT')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyJ'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat&&(e.code==='Space'||e.code==='KeyJ'))action(true);};
window.onkeyup=e=>{keys.delete(e.code);if(e.code==='Space'||e.code==='KeyJ')action(false);};window.onblur=()=>{keys.clear();action(false);stickX=stickZ=0;};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.onresize=resize;resize();
let previous=performance.now();const target=new THREE.Vector3();
// Input transport must not wait for a WebGL frame (screenshots, shader work or a slow GPU).
setInterval(()=>{
  const now=performance.now(),me=snapshot?.entities.find(e=>e.id===id);
  if(me&&!document.hidden&&ws?.readyState===WebSocket.OPEN){lastSend=now;send({type:'input',seq:++seq,x:local.x,z:local.z,facing:me.facing,held,lunge});lunge=false;}
  if(me&&!document.hidden&&now-lastMessage>2200&&now>retryAt){retryAt=now+2500;ws?.close();}
},50);
function frame(now:number){requestAnimationFrame(frame);const dt=Math.min(.05,(now-previous)/1000);previous=now;const me=snapshot?.entities.find(e=>e.id===id);
  if(me&&snapshot){let x=stickX+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),z=stickZ+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);const d=Math.hypot(x,z);if(d>1){x/=d;z/=d;}
    if(d>.1&&!firstMove){firstMove=true;if(!firstFreeze)flash('Hold LIGHT. It finds the goose for you.',2);}
    if(snapshot.phase==='playing'&&me.frozenUntil<=snapshot.now&&!(me.role==='goose'&&snapshot.now-me.lungeAt<.84)){const speed=me.role==='kid'?(me.light?TUNE.litSpeed:TUNE.kidSpeed):TUNE.gooseSpeed;local=slide(local,x*speed*dt,z*speed*dt);if(d>.1)me.facing=Math.atan2(x,z);}
  }
  const living=new Set<string>();for(const e of snapshot?.entities??[]){living.add(e.id);let root=models.get(e.id);if(root&&root.userData.role!==e.role){scene.remove(root);models.delete(e.id);root=undefined;}root??=model(e);const p=e.id===id?local:e;root.position.set(p.x,0,p.z);root.rotation.y=e.facing;root.position.y=e.frozenUntil>(snapshot?.now??0)?0:Math.sin(now*.012+e.personality)*.04;
    const beam=beams.get(e.id)!;beam.intensity=e.light?35:0;if(e.id===id)beam.color.set(torchReward(best.time).color);beam.position.set(p.x,1.3,p.z);beam.target.position.set(p.x+Math.sin(e.aim)*8,.2,p.z+Math.cos(e.aim)*8);
  }
  for(const [key,root] of models)if(!living.has(key)){scene.remove(root);models.delete(key);const b=beams.get(key);if(b)b.intensity=0;}
  snapshot?.pickups.forEach((p,i)=>{const m=batteries[i];m.visible=p.readyAt<=snapshot!.now;m.position.set(p.x,.6+Math.sin(now*.003)*.1,p.z);m.rotation.z=Math.PI/2;m.rotation.y=now*.002;});
  target.set(me?local.x:0,0,me?local.z:3);camera.position.set(target.x,target.y+14,target.z+10);camera.lookAt(target.x,0,target.z-1.5);
  if(now>messageUntil&&el('message').textContent)el('message').textContent='';
  if(!document.hidden)renderer.render(scene,camera);
}
requestAnimationFrame(frame);if(credential)connect();
