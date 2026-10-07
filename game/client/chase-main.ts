import * as THREE from 'three';
import {PARK,TUNE,slide,type ChaseSnapshot,type Entity} from '../shared/chase';
import './chase-style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<canvas aria-label="The Park"></canvas><div id="shade"></div>
<main id="title"><h1>Dusk Dusk<br><em>Goose.</em></h1><p>The dark has a funny way of finding you.</p><p>Run. Hold your light. Don't become a goose.</p><div class="entry"><input id="name" aria-label="Your name" placeholder="Your name" maxlength="16" value="Kid"><button id="play">Play</button></div><div class="entry"><input id="code" aria-label="Room code" placeholder="Room code" maxlength="5"><button id="join">Join friends</button></div><p id="notice" role="status">1–6 friends · No login · WASD + Space</p></main>
<header id="hud" hidden><div><b id="room"></b><span id="invite">Invite a friend with this code</span></div><div id="timer">0:00</div><div id="count"></div></header>
<div id="message" role="status"></div><section id="results" hidden><h2>The geese got you!</h2><p id="survived"></p><p>Hold on. Next chase starts in a moment.</p></section>
<div id="controls" hidden><div id="stick" aria-label="Move"><span></span><b>MOVE</b></div><button id="action">☀<br>LIGHT</button></div>`;
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
const keys=new Set<string>();let stickX=0,stickZ=0,pointer:number|undefined,origin={x:0,y:0};
let credential:any;try{credential=JSON.parse(sessionStorage.getItem('ddg-seat')??'null');}catch{}
function send(m:unknown){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(m));}
function connect(intent?:'create'|'join'){
  if(ws)ws.close();const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);ws=socket;
  socket.onopen=()=>{lastMessage=performance.now();if(credential&&!intent&&autoResume)send({type:'resume',...credential});else if(intent)send({type:intent,code:el<HTMLInputElement>('code').value.trim().toUpperCase(),name:el<HTMLInputElement>('name').value.trim()||'Kid'});};
  socket.onmessage=event=>{if(ws!==socket)return;lastMessage=performance.now();const m=JSON.parse(event.data);
    if(m.type==='seat'){id=m.id;token=m.token;roomCode=m.code;bootId=m.bootId;credential={token,code:roomCode,bootId};sessionStorage.setItem('ddg-seat',JSON.stringify(credential));local={...m.snapshot.entities.find((e:Entity)=>e.id===id)};seq=m.nextSeq;el('title').hidden=true;el('controls').hidden=false;el('hud').hidden=false;apply(m.snapshot);}
    if(m.type==='snapshot')apply(m.snapshot);
    if(m.type==='correction'){local.x=m.x;local.z=m.z;}
    if(m.type==='error'){el('notice').textContent=m.message;}
    if(m.type==='ended'||m.type==='displaced'){autoResume=false;credential=null;sessionStorage.removeItem('ddg-seat');snapshot=undefined;el('title').hidden=false;el('controls').hidden=true;el('hud').hidden=true;el('results').hidden=true;el('notice').textContent=m.message??'Your seat continued in another tab.';}
  };
  socket.onclose=()=>{if(ws===socket&&credential&&autoResume){el('message').textContent='Reconnecting…';setTimeout(()=>connect(),500);}};
}
function apply(s:ChaseSnapshot){const was=snapshot;snapshot=s;const me=s.entities.find(e=>e.id===id);if(!me)return;
  if(!was||was.phase==='results'&&s.phase==='playing'||me.frozenUntil>s.now||me.role==='goose'&&s.now-me.lungeAt<.84){local.x=me.x;local.z=me.z;}
  el('room').textContent=`ROOM ${s.code}`;el('timer').textContent=`${Math.floor(s.elapsed/60)}:${String(Math.floor(s.elapsed%60)).padStart(2,'0')}`;el('count').textContent=`${s.entities.filter(e=>e.role==='kid').length} KIDS LEFT`;
  el('action').innerHTML=me.role==='kid'?`☀<br>LIGHT<br>${Math.ceil(me.battery)}%`:'➤<br>LUNGE';
  el('results').hidden=s.phase!=='results';el('survived').textContent=`You lasted ${s.elapsed.toFixed(1)} seconds.`;
  const event=s.events.at(-1);if(event&&event.id!==(was?.events.at(-1)?.id)){el('message').textContent=event.type==='freeze'?'FROZEN! +25':event.type==='catch'?(event.target===id?"You're a goose now!":'CAUGHT!'):event.type==='pickup'?'+50 BATTERY':'';}
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
function frame(now:number){requestAnimationFrame(frame);const dt=Math.min(.05,(now-previous)/1000);previous=now;const me=snapshot?.entities.find(e=>e.id===id);
  if(me&&snapshot){let x=stickX+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),z=stickZ+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0);const d=Math.hypot(x,z);if(d>1){x/=d;z/=d;}
    if(snapshot.phase==='playing'&&me.frozenUntil<=snapshot.now&&!(me.role==='goose'&&snapshot.now-me.lungeAt<.84)){const speed=me.role==='kid'?(held?TUNE.litSpeed:TUNE.kidSpeed):TUNE.gooseSpeed;local=slide(local,x*speed*dt,z*speed*dt);if(d>.1)me.facing=Math.atan2(x,z);}
    if(now-lastSend>50&&ws?.readyState===WebSocket.OPEN){lastSend=now;send({type:'input',seq:++seq,x:local.x,z:local.z,facing:me.facing,held,lunge});lunge=false;}
    if(now-lastMessage>2200&&now>retryAt){retryAt=now+2500;ws?.close();}
  }
  const living=new Set<string>();for(const e of snapshot?.entities??[]){living.add(e.id);let root=models.get(e.id);if(root&&root.userData.role!==e.role){scene.remove(root);models.delete(e.id);root=undefined;}root??=model(e);const p=e.id===id?local:e;root.position.set(p.x,0,p.z);root.rotation.y=e.facing;root.position.y=e.frozenUntil>(snapshot?.now??0)?0:Math.sin(now*.012+e.personality)*.04;
    const beam=beams.get(e.id)!;beam.intensity=e.light?35:0;beam.position.set(p.x,1.3,p.z);beam.target.position.set(p.x+Math.sin(e.aim)*8,.2,p.z+Math.cos(e.aim)*8);
  }
  for(const [key,root] of models)if(!living.has(key)){scene.remove(root);models.delete(key);const b=beams.get(key);if(b)b.intensity=0;}
  snapshot?.pickups.forEach((p,i)=>{const m=batteries[i];m.visible=p.readyAt<=snapshot!.now;m.position.set(p.x,.6+Math.sin(now*.003)*.1,p.z);m.rotation.z=Math.PI/2;m.rotation.y=now*.002;});
  target.set(me?local.x:0,0,me?local.z:3);camera.position.set(target.x,target.y+14,target.z+10);camera.lookAt(target.x,0,target.z-1.5);
  if(!document.hidden)renderer.render(scene,camera);
}
requestAnimationFrame(frame);if(credential)connect();
