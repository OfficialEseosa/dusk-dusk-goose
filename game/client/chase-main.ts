import {ChaseArt} from './chase-art';
import {ChaseDisplay} from './chase-display';
import {ChaseSound} from './chase-sound';
import {arenaFor,TUNE,tonightSeed,distance,type ChaseSnapshot,type Entity} from '../shared/chase';
import {readBest,saveBest,recordRun,torchReward,formatTime} from './chase-best';
import {ServerClock,RemotePositions} from './chase-network-view';
import {SnapshotDecoder,encodeInput} from '../shared/chase-wire';
import {advanceMotion} from './chase-motion';
import './chase-style.css';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<canvas aria-label="The Park" tabindex="0"></canvas><div id="shade"></div><div id="danger"></div><div id="impact"></div>
<main id="title"><div class="brand"><p class="eyebrow">A LITTLE LIGHT. A LOT OF HONK.</p><h1><span>Dusk Dusk</span><br><em>Goose.</em></h1><p class="pitch">Run. Freeze the flock.<br>Get caught. Chase your friends.</p></div><div class="entry-panel"><p class="eyebrow">1–6 PLAYERS · ONE VERY BAD GOOSE</p><input id="name" aria-label="Your name" placeholder="Your name" maxlength="16" value="Kid"><button id="play">Play</button><div class="join-row"><input id="code" aria-label="Room code" placeholder="Code" maxlength="5"><button id="join">Join friends</button></div><p id="notice" role="status">No login · WASD + Space</p></div></main>
<header id="hud" hidden><div><b id="room"></b><span id="invite">Invite a friend with this code</span></div><div id="clock"><b id="timer">0:00</b><span id="best">BEST 0:00</span><span id="recharge" hidden>NO RECHARGE</span></div><div><span id="count"></span><span id="hour">HOUR 1</span></div></header>
<aside id="role-card" hidden><b id="role-title"></b><span id="role-tip"></span></aside><div id="final-count" hidden aria-live="off"></div><div id="dawn-wash"></div><div id="flock-eyes" hidden><i></i><i></i></div><div id="pickup-hint" hidden></div><div id="threat" hidden>→ GOOSE</div><div id="message" role="status"></div><section id="results" hidden><h2 id="result-title">The geese got you!</h2><p id="survived"></p><p id="reward"></p><p id="scores" hidden></p><p id="result-invite"></p><p id="retry-hint"></p></section>
<div id="controls" hidden><div id="stick" aria-label="Move"><span></span><b>MOVE</b></div><button id="action"><span id="action-icon">☀</span><span id="action-label">LIGHT</span><span id="action-state">100%</span></button></div><aside id="home-tip" hidden>Add to your Home Screen for more room.<br>Tap this tip to dismiss.</aside><aside id="portrait-hint" hidden><b aria-hidden="true">↻</b><h2>Turn your phone sideways</h2><p>The chase keeps going. We’ll keep you moving.</p></aside>`;
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=app.querySelector('canvas')!;
const art=new ChaseArt(canvas);
const sound=new ChaseSound();
art.ready.catch(error=>{el('notice').textContent='The park could not load. Refresh to try again.';console.error(error);});
let snapshot:ChaseSnapshot|undefined,id='',token='',roomCode='',bootId='',ws:WebSocket|undefined;
const clock=new ServerClock(),remote=new RemotePositions();let snapshotAt=0;
let decoder=new SnapshotDecoder();
let local={x:-4,z:6},seq=0,held=false,lunge=false,lastSend=0,lastMessage=0,retryAt=0,autoResume=true;
let best=readBest(),runId='',runBest=best.time,newBestShown=false,lastBestSecond=-1,lastEventId=0,messageUntil=0,roleUntil=0,eyesUntil=0,eyesFrom=0,resultOpenedAt=0,lastFinalNumber=-1,firstMove=false,firstFreeze=false;
el('notice').textContent=`Tonight's park · ${String(tonightSeed()).slice(4,6)}/${String(tonightSeed()).slice(6)} · WASD + Space`;
const keys=new Set<string>();let stickX=0,stickZ=0,pointer:number|undefined,origin={x:0,y:0};
const display=new ChaseDisplay(el('portrait-hint'),el('home-tip'),()=>{keys.clear();held=false;lunge=false;stickX=stickZ=0;pointer=undefined;el('stick').querySelector('span')!.style.transform='';});
let credential:any;try{credential=JSON.parse(sessionStorage.getItem('ddg-seat')??'null');}catch{}
function send(m:any){if(ws?.readyState===WebSocket.OPEN)ws.send(m.type==='input'?encodeInput({...m,clientTime:clock.ready?clock.now(performance.now()):Date.now()}):JSON.stringify(m));}
function connect(intent?:'create'|'join'){
  if(ws)ws.close();const socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);socket.binaryType='arraybuffer';ws=socket;
  socket.onopen=()=>{lastMessage=performance.now();remote.clear();decoder=new SnapshotDecoder();send({type:'ping',clientTime:performance.now()});if(credential&&!intent&&autoResume)send({type:'resume',...credential});else if(intent)send({type:intent,code:el<HTMLInputElement>('code').value.trim().toUpperCase(),name:el<HTMLInputElement>('name').value.trim()||'Kid',beginner:best.runs===0});};
  socket.onmessage=event=>{if(ws!==socket)return;lastMessage=performance.now();if(event.data instanceof ArrayBuffer){try{apply(decoder.decode(new Uint8Array(event.data)));}catch{socket.close(1007,'State could not be read');}return;}const m=JSON.parse(event.data);
    if(m.type==='world'||m.type==='events'){decoder.accept(m);return;}
    if(m.type==='seat'){if(el('message').textContent==='Reconnecting…'){el('message').textContent='';messageUntil=0;}id=m.id;token=m.token;roomCode=m.code;bootId=m.bootId;credential={token,code:roomCode,bootId};sessionStorage.setItem('ddg-seat',JSON.stringify(credential));decoder.reset(m.snapshot);local={...m.snapshot.entities.find((e:Entity)=>e.id===id)};seq=m.nextSeq;el('title').hidden=true;el('controls').hidden=false;el('hud').hidden=false;apply(m.snapshot);}
    if(m.type==='snapshot')apply(m.snapshot);
    if(m.type==='pong'&&Number.isFinite(m.clientTime)&&Number.isFinite(m.serverTime))clock.sample(m.clientTime,performance.now(),m.serverTime);
    if(m.type==='correction'){local.x=m.x;local.z=m.z;}
    if(m.type==='retryQueued')flash('Next chase queued!',.7);
    if(m.type==='error'){el('notice').textContent=m.message;sound.cue('error',.55);}
    if(m.type==='ended'||m.type==='displaced'){autoResume=false;credential=null;sessionStorage.removeItem('ddg-seat');snapshot=undefined;sound.update(undefined,'',local);el('title').hidden=false;el('controls').hidden=true;el('hud').hidden=true;el('results').hidden=true;el('notice').textContent=m.message??'Your seat continued in another tab.';}
  };
  socket.onclose=()=>{if(ws===socket&&credential&&autoResume){flash('Reconnecting…',30);sound.cue('reconnect',.4);setTimeout(()=>connect(),500);}};
}
function flash(message:string,seconds=1.4){el('message').textContent=message;messageUntil=performance.now()+seconds*1000;}
function roleCard(title:string,tip:string,seconds=1.8){el('role-title').textContent=title;el('role-tip').textContent=tip;roleUntil=performance.now()+seconds*1000;el('role-card').hidden=false;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)el('role-card').animate([{transform:'translateX(-50%) scale(.86)',opacity:0},{transform:'translateX(-50%) scale(1.04)',opacity:1},{transform:'translateX(-50%) scale(1)',opacity:1}],{duration:280});}
function apply(s:ChaseSnapshot){const was=snapshot;snapshot=s;canvas.setAttribute('aria-label',s.arena==='culdesac'?'The Cul-de-sac':'The Park');snapshotAt=performance.now();const me=s.entities.find(e=>e.id===id);if(!me)return;
  const nextRun=s.solo?.runId??s.multi?.runId;const fresh=!!nextRun&&runId!==nextRun;
  if(fresh){runId=nextRun!;runBest=best.time;newBestShown=false;lastBestSecond=-1;lastEventId=was?0:s.events.at(-1)?.id??0;firstMove=false;firstFreeze=false;held=false;lunge=false;flash(s.mode==='solo'?'Move left. Hold LIGHT when the goose comes.':me.role==='kid'?'Stay a kid until dawn!':'You start as the goose. Chase your friends!',2);el('timer').classList.remove('record');}
  if(fresh){remote.clear();roleCard(me.role==='kid'?'YOU’RE A KID':'YOU’RE THE GOOSE',me.role==='kid'?'Hold LIGHT to freeze. Release and run.':'Tap LUNGE. Catch a kid. Grow the flock.');}remote.receive(s.now,s.entities);
  if(!was||fresh||me.bot||was.phase==='results'&&s.phase==='playing'||me.frozenUntil>s.now||me.role==='goose'&&s.now-me.lungeAt<.84){local.x=me.x;local.z=me.z;}
  const gooseCount=s.entities.filter(e=>e.role==='goose').length;
  el('room').textContent=`ROOM ${s.code}`;el('timer').textContent=formatTime(s.elapsed);el('count').textContent=s.mode==='solo'?`${gooseCount} ${gooseCount===1?'GOOSE':'GEESE'}`:`${s.entities.filter(e=>e.role==='kid').length} KIDS LEFT`;
  el('hour').textContent=`HOUR ${(s.solo?.hour??0)+1}`;el('best').textContent=`BEST ${formatTime(Math.max(best.time,s.elapsed))}`;
  if(s.multi){el('timer').textContent=s.multi.stage==='playing'?formatTime(Math.max(0,TUNE.roundSeconds-s.elapsed)):String(Math.max(0,Math.ceil((s.multi.deadline-s.multi.serverTime)/1000)));el('hour').textContent=`ROUND ${Math.max(1,s.multi.round)} / 3`;el('best').textContent=`SCORE ${Math.floor((s.multi.scores.find(p=>p.id===id)?.total??0)+(s.multi.stage==='results'?0:me.score))}`;}
  const result=s.phase==='results'&&s.multi?.stage!=='joining';if(result&&was?.phase!=='results')resultOpenedAt=performance.now();el('recharge').hidden=!(s.multi?.stage==='playing'&&s.elapsed>=60&&me.role==='kid');
  el('action-icon').textContent=result?'↻':me.role==='kid'?'☀':'➤';el('action-label').textContent=result?'AGAIN':me.role==='kid'?'LIGHT':'LUNGE';
  el('action-state').textContent=result?(s.now<(s.solo?.retryReadyAt??0)?'GET READY':'TAP'):me.role==='kid'?`${Math.ceil(me.battery)}%`:'SPACE';
  el('action').style.setProperty('--charge',`${me.battery}%`);
  if(s.mode==='solo'){
    if(s.phase==='playing'&&s.elapsed>runBest&&s.elapsed>1&&!newBestShown){newBestShown=true;el('timer').classList.add('record');if(runBest>0){flash('NEW BEST!');sound.newBest();navigator.vibrate?.(30);}}
    if(Math.floor(s.elapsed)!==lastBestSecond&&s.elapsed>best.time){best={...best,time:s.elapsed,score:Math.max(best.score,me.score)};saveBest(best);lastBestSecond=Math.floor(s.elapsed);}
    if(result&&s.solo&&best.lastResult!==s.solo.runId){best=recordRun(best,s.solo.runId,s.elapsed,me.score);saveBest(best);}
  }
  const showResults=result&&(s.multi?s.multi.stage==='results'&&s.multi.deadline-s.multi.serverTime<5400:s.now-(s.solo?.resultAt??s.now)>=.6);
  el('results').hidden=!showResults;el('message').hidden=showResults;
  el('result-title').textContent=s.elapsed>=runBest?'A new personal best!':'The geese got you!';
  el('survived').textContent=`${formatTime(s.elapsed)} survived${runBest>s.elapsed?` · ${Math.ceil(runBest-s.elapsed)}s short of your best`:''}`;
  el('reward').textContent=torchReward(best.time).goal;el('result-invite').textContent=`Add a friend: ${s.code} · Goose next round`;
  el('retry-hint').textContent=s.now<(s.solo?.retryReadyAt??0)?'Tap AGAIN to queue your next chase.':'Tap AGAIN · or let the next chase find you';
  el('scores').hidden=!s.multi||!showResults;
  if(s.multi){
    if(s.multi.stage==='joining')flash('A friend joined! A new round starts in a moment.',.2);
    if(s.multi.stage==='countdown')flash(`${me.role==='kid'?'KID · LIGHT & RUN':'GOOSE · LUNGE & CATCH'} · ${Math.max(1,Math.ceil((s.multi.deadline-s.multi.serverTime)/1000))}`,.2);
    if(s.multi.stage==='playing'&&s.multi.lastKid===id&&!was?.multi?.lastKid){flash('LAST KID! Full battery · faster · double points');navigator.vibrate?.(30);}
    el('result-title').textContent=s.multi.winner?`${s.multi.scores.find(p=>p.id===s.multi!.winner)?.name??'Kid'} wins the night!`:s.entities.some(p=>p.role==='kid')?'Dawn! Kids made it!':'The flock got everyone!';
    el('survived').textContent=`Round ${s.multi.round} / 3 · +${Math.floor(me.score)} points`;
    el('reward').textContent=s.multi.nextGeese.length?`Next goose: ${s.multi.nextGeese.map(id=>s.multi!.scores.find(p=>p.id===id)?.name??'Kid').join(' & ')}`:'';el('result-invite').textContent=`Invite friends: ${s.code}`;
    el('scores').textContent=[...s.multi.scores].sort((a,b)=>b.total-a.total).map(p=>`${p.name}: ${Math.floor(p.total)}`).join(' · ');
    el('retry-hint').textContent=`Next chase in ${Math.max(0,Math.ceil((s.multi.deadline-s.multi.serverTime)/1000))} · everyone taps to skip`;
  }
  for(const event of s.events){if(event.id<=lastEventId)continue;lastEventId=event.id;
    if(event.type==='freeze'&&event.actor===id){firstFreeze=true;navigator.vibrate?.(30);flash('FROZEN! +25 · RUN!');}
    if(event.type==='catch'&&event.target===id){el('impact').animate([{opacity:.5},{opacity:0}],{duration:120});navigator.vibrate?.([60,40,60]);}
    if(event.type==='catch'){const name=s.entities.find(e=>e.id===event.target)?.name??'Kid';if(event.target===id){roleCard('YOU’RE A GOOSE NOW','Tap LUNGE. Chase your friends.',1.6);flash("You're a goose! HONK.");}else if(event.actor===id){flash(`+300 · CAUGHT ${name}`);navigator.vibrate?.(40);}else flash(`➤ ${name} GOT GOOSED`,1);el('count').animate([{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:250});}
    if(event.type==='pickup'&&event.actor===id){flash('+50 BATTERY');navigator.vibrate?.(15);}
    if(event.type==='near'&&event.target===id){flash('CLOSE! +50 · BATTERY +10');navigator.vibrate?.(15);}
    if(event.type==='miss'&&event.actor===id)flash('MISSED! Catch your breath.',.6);
    if(event.type==='thaw'&&event.actor===id)flash('THAWED · SHIELD ON',.9);
    if(event.type==='hour'){flash('+1 HOUR · BATTERY FULL');el('impact').animate([{opacity:.25},{opacity:0}],{duration:500});navigator.vibrate?.(30);}
    if(event.type==='dawn'){flash('YOU MADE IT!',1);navigator.vibrate?.(150);}
    if(event.type==='flock'){eyesFrom=performance.now()+350;eyesUntil=eyesFrom+450;navigator.vibrate?.(150);}
    if(event.type==='spawn'){navigator.vibrate?.(20);flash(`${event.x>=local.x?'→':'←'} ${s.entities.find(e=>e.id===event.actor)?.name.toUpperCase()??'GOOSE'}!`,1);}
  }
  el('action').classList.toggle('low',me.role==='kid'&&me.battery<25&&!result);if(me.role==='kid'&&!result&&me.battery<25)el('action-state').textContent=me.battery<10?'EMPTY':`LOW ${Math.ceil(me.battery)}%`;
  if(me.role==='kid'&&me.battery<10&&(was?.entities.find(e=>e.id===id)?.battery??100)>=10)navigator.vibrate?.(20);
  const danger=s.entities.reduce((d,e)=>e.role==='goose'&&e.id!==id?Math.min(d,distance(e,me)):d,100);el('danger').style.opacity=String(me.role==='kid'&&!result?Math.max(0,(7-danger)/5)*.45:0);const closest=s.entities.filter(e=>e.role==='goose'&&e.id!==id).sort((a,b)=>distance(a,me)-distance(b,me))[0];if(closest)el('danger').style.background=`linear-gradient(${closest.x<me.x?90:270}deg,#ff2e5799,transparent 60%)`;
  const threat=s.entities.find(e=>e.role==='goose'&&distance(e,me)<TUNE.range&&e.immuneUntil<=s.now);
  el('action').classList.toggle('attention',!!threat&&!firstFreeze&&me.role==='kid'&&!result);
  el('threat').hidden=result||!s.entities.some(e=>e.role==='goose'&&distance(e,me)>7);
  const lastKid=s.entities.find(e=>e.id===s.multi?.lastKid);if(me.role==='goose'&&lastKid){el('threat').hidden=result;el('threat').textContent=`${lastKid.x>=me.x?'→':'←'} LAST KID`;}
  const battery=s.pickups.filter(p=>p.readyAt<=s.now).sort((a,b)=>distance(a,me)-distance(b,me))[0];el('pickup-hint').hidden=result||me.role!=='kid'||me.battery>=25||!battery;if(battery)el('pickup-hint').textContent=`${battery.x>=me.x?'→':'←'} BATTERY`;
  const nearest=s.entities.filter(e=>e.role==='goose').sort((a,b)=>distance(a,me)-distance(b,me))[0];if(nearest&&me.role==='kid')el('threat').textContent=`${nearest.x>=me.x?'→':'←'} GOOSE`;
  sound.update(s,id,local);
}
el('play').onclick=()=>{display.enter();autoResume=true;credential=null;connect('create');};el('join').onclick=()=>{display.enter();autoResume=true;credential=null;connect('join');};
const action=(on:boolean)=>{held=on;if(on&&snapshot?.phase==='results'){send({type:'retry'});return;}if(on)lunge=true;};
el('action').onpointerdown=e=>{e.preventDefault();el('action').setPointerCapture(e.pointerId);action(true);};
el('action').onpointerup=el('action').onpointercancel=()=>action(false);
el('stick').onpointerdown=e=>{if(pointer!==undefined)return;pointer=e.pointerId;origin={x:e.clientX,y:e.clientY};el('stick').setPointerCapture(e.pointerId);};
el('stick').onpointermove=e=>{if(e.pointerId!==pointer)return;const dx=e.clientX-origin.x,dy=e.clientY-origin.y,d=Math.hypot(dx,dy),amount=d<7?0:Math.min(1,d/34);stickX=d?dx/d*amount:0;stickZ=d?dy/d*amount:0;const knob=el('stick').querySelector('span')!;knob.style.transform=`translate(${stickX*38}px,${stickZ*38}px)`;};
el('stick').onpointerup=el('stick').onpointercancel=()=>{pointer=undefined;stickX=stickZ=0;el('stick').querySelector('span')!.style.transform='';};
window.onkeydown=e=>{if((e.target as HTMLElement).tagName==='INPUT')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyJ'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat&&(e.code==='Space'||e.code==='KeyJ'))action(true);};
window.onkeyup=e=>{keys.delete(e.code);if(e.code==='Space'||e.code==='KeyJ')action(false);};window.onblur=()=>{keys.clear();action(false);stickX=stickZ=0;};
function resize(){art.resize();}window.onresize=resize;resize();
let previousInput=performance.now();
// Input transport must not wait for a WebGL frame (screenshots, shader work or a slow GPU).
setInterval(()=>{
  const now=performance.now(),dt=(now-previousInput)/1000,me=snapshot?.entities.find(e=>e.id===id);previousInput=now;
  if(me&&snapshot&&!document.hidden&&!display.portrait){const x=stickX+(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),z=stickZ+(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0),d=Math.hypot(x,z);
    if(d>.1&&!firstMove){firstMove=true;if(!firstFreeze)flash('Hold LIGHT. It finds the goose for you.',2);}
    if((snapshot.phase==='playing'||snapshot.multi)&&me.frozenUntil<=snapshot.now&&!(me.role==='goose'&&(me.safeUntil>snapshot.now||snapshot.now-me.lungeAt<.84))){const speed=me.role==='kid'?(me.light?TUNE.litSpeed:TUNE.kidSpeed)*(snapshot.multi?.lastKid===id?1.08:1):TUNE.gooseSpeed*(snapshot.gooseBoost??1);local=advanceMotion(local,{x,z},speed,dt,arenaFor(snapshot.arena));if(d>.1)me.facing=Math.atan2(x,z);}
  }
  if(me&&!document.hidden&&!display.portrait&&ws?.readyState===WebSocket.OPEN){lastSend=now;send({type:'input',seq:++seq,x:local.x,z:local.z,facing:me.facing,held,lunge});lunge=false;}
  if(me&&!document.hidden&&now-lastMessage>2200&&now>retryAt){retryAt=now+2500;ws?.close();}
},50);
setInterval(()=>{if(ws?.readyState===WebSocket.OPEN)send({type:'ping',clientTime:performance.now()});},5000);
function frame(now:number){requestAnimationFrame(frame);el('role-card').hidden=now>roleUntil||!snapshot||snapshot.phase==='results';el('flock-eyes').hidden=now<eyesFrom||now>eyesUntil;let finalNumber=0;const multi=snapshot?.multi;if(multi?.stage==='playing'){const remaining=clock.ready?(multi.deadline-clock.now(now))/1000:(multi.deadline-multi.serverTime)/1000;finalNumber=remaining>0&&remaining<=10?Math.ceil(remaining):0;}el('final-count').hidden=!finalNumber;if(finalNumber!==lastFinalNumber){lastFinalNumber=finalNumber;el('final-count').textContent=String(finalNumber);if(finalNumber){el('final-count').animate([{transform:'translate(-50%,-50%) scale(1.22)',opacity:1},{transform:'translate(-50%,-50%) scale(1)',opacity:.65}],{duration:350});navigator.vibrate?.(10);}}const dawn=snapshot?.events.some(e=>e.type==='dawn')&&snapshot.phase==='results';el('dawn-wash').style.opacity=dawn?'1':'0';const me=snapshot?.entities.find(e=>e.id===id);if(me?.role==='kid'&&snapshot?.phase==='playing'){let nearest=100;for(const e of snapshot.entities)if(e.role==='goose'&&e.id!==id)nearest=Math.min(nearest,distance(e,local));el('danger').style.opacity=String(Math.max(0,(7-nearest)/5)*.45*(nearest<4?.7+.3*Math.sin(now*.012566):1));}
  if(snapshot?.multi&&clock.ready&&snapshot.multi.stage!=='results'){const remaining=Math.max(0,snapshot.multi.deadline-clock.now(now));el('timer').textContent=snapshot.multi.stage==='playing'?formatTime(remaining/1000):String(Math.ceil(remaining/1000));}
  if(snapshot?.multi?.stage==='results'){const progress=Math.min(1,Math.max(0,(now-resultOpenedAt-600)/800));el('scores').textContent=[...snapshot.multi.scores].sort((a,b)=>b.total-a.total).map(p=>`${p.name}: ${Math.floor(p.total-p.round*(1-progress))}`).join(' · ');}
  art.render(now,snapshot,id,local,e=>remote.at(e.id,(snapshot?.now??0)+Math.min(.2,(now-snapshotAt)/1000)-.1,e),torchReward(best.time).color);
  el('message').style.visibility=now<roleUntil&&!el('role-card').hidden?'hidden':'visible';
  if(now>messageUntil&&el('message').textContent)el('message').textContent='';
}
requestAnimationFrame(frame);if(credential)connect();
