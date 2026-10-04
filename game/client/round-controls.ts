import type {RoomSnapshot} from '../shared/protocol';
import {HIDING_SPOTS,FLASHLIGHT_PICKUP,ACTION_RANGE,SEARCH_MS} from '../shared/round';
import type {Street} from './street';

type Reply={ok:boolean;error?:{message:string}};
/** Persistent controls: snapshots change state and text, never the input elements. */
export class RoundControls {
 private room?:RoomSnapshot;
 private readonly roleCard:HTMLElement;
 private roleKey="";
 private roleUntil=0;
 private actionTaught=false;
 private attentionUntil=0;
 private offset=0;
 private held=false;
 private generation=0;
 private heldRoundNumber=0;
 private completing=false;
 private timer:ReturnType<typeof setInterval>;
 private target?:{type:'pickup'|'bury'|'disturb'|'search';spotId?:string;name:string;spotName?:string};
 private readonly button:HTMLButtonElement;
 private readonly progress:HTMLSpanElement;
 private readonly phase:HTMLElement;
 private readonly clock:HTMLElement;
 private readonly instruction:HTMLElement;
 private readonly next:HTMLButtonElement;
 private readonly radio:HTMLElement;
 private readonly choices:HTMLElement;
 private readonly matchPanel:HTMLElement;
 private readonly scoreRows:HTMLElement[]=[];
 private readonly replay:HTMLButtonElement;
 private readonly hud:HTMLElement;
 private readonly announcement:HTMLElement;
 private announcedMatch="";
 private announcementUntil=0;
 constructor(private container:HTMLElement,private street:Street,private playerId:string,private send:(type:string,fields?:Record<string,unknown>)=>Promise<Reply>,private leave:()=>void){
  this.roleCard=document.createElement('p');this.roleCard.id='role-card';this.roleCard.hidden=true;this.roleCard.setAttribute('role','status');container.append(this.roleCard);
  try{this.actionTaught=localStorage.getItem('maple:action-taught:v1')==='yes';}catch{}
  const panel=document.createElement('div');panel.className='round-hud';panel.innerHTML='<span id="round-phase"></span><strong id="round-clock" aria-label="Time remaining"></strong>';
  this.hud=panel;container.append(panel);this.phase=panel.querySelector('#round-phase')!;this.clock=panel.querySelector('#round-clock')!;this.instruction=document.createElement('p');this.instruction.id='round-instruction';container.append(this.instruction);
  this.radio=document.createElement('div');this.radio.id='clue-transmission';this.radio.setAttribute('role','status');this.radio.hidden=true;container.append(this.radio);
  this.choices=document.createElement('div');this.choices.id='clue-choices';this.choices.hidden=true;container.append(this.choices);
  for(let i=0;i<3;i++){const choice=document.createElement('button');choice.type='button';choice.addEventListener('click',()=>{const option=this.room?.round?.clueOffer?.options[i];if(option)void this.send('choose_clue',{clueId:option.id});});this.choices.append(choice);}
  this.button=document.createElement('button');this.button.id='round-action';this.button.className='round-action';this.button.hidden=true;
  this.button.innerHTML='<span class="action-progress"></span><span class="action-name"></span><small class="action-spot"></small><small class="action-key">E</small>';container.append(this.button);this.progress=this.button.querySelector('.action-progress')!;
  this.next=document.createElement('button');this.next.id='next-round';this.next.textContent='Start next round';this.next.className='next-round';this.next.hidden=true;container.append(this.next);this.next.addEventListener('click',()=>void this.send('start'));
  this.matchPanel=document.createElement('section');this.matchPanel.id='match-panel';this.matchPanel.hidden=true;this.matchPanel.setAttribute('aria-label','Match results');
  this.matchPanel.innerHTML='<div class="match-heading"><h2 id="match-title"></h2><span id="match-rounds"></span></div><p id="match-result"></p><p id="match-announcement" role="status"></p><ol id="match-scores" aria-label="Scores"></ol><p id="solo-best"></p><p id="match-countdown" aria-live="polite"></p><div class="match-actions"><button id="play-again">Play again</button><button id="match-leave">Back to title</button></div>';
  const scores=this.matchPanel.querySelector('#match-scores')!;
  for(let i=0;i<6;i++){const row=document.createElement('li');row.innerHTML='<span class="score-name"></span><span class="score-earned"></span><strong class="score-total"></strong>';scores.append(row);this.scoreRows.push(row);}
  this.replay=this.matchPanel.querySelector<HTMLButtonElement>('#play-again')!;this.replay.addEventListener('click',()=>void this.send('play_again'));
  this.matchPanel.querySelector('#match-leave')!.addEventListener('click',this.leave);
  this.matchPanel.querySelector('.match-actions')!.prepend(this.next);container.append(this.matchPanel);
  this.announcement=document.createElement('p');this.announcement.id='match-banner';this.announcement.hidden=true;this.announcement.setAttribute('role','status');container.append(this.announcement);
  this.button.addEventListener('pointerdown',this.down);this.button.addEventListener('pointerup',this.up);this.button.addEventListener('pointercancel',this.up);this.button.addEventListener('lostpointercapture',this.up);
  document.addEventListener('focusin',this.focusInput);window.addEventListener('keydown',this.keyDown);window.addEventListener('keyup',this.keyUp);window.addEventListener('blur',this.up);document.addEventListener('visibilitychange',this.visibility);
  this.timer=setInterval(()=>this.tick(),50);
 }
 update(room:RoomSnapshot){const changed=this.room?.round?.number!==room.round?.number||this.room?.round?.phase!==room.round?.phase;this.room=room;this.offset=room.serverTime-Date.now();if(changed)this.release();this.tick();}
 private tick(){
  const room=this.room,round=room?.round,player=room?.players.find(p=>p.id===this.playerId);if(!round||!player||!room)return;
  const now=Date.now()+this.offset,seconds=Math.max(0,Math.ceil((round.phaseEndsAt-now)/1000));
  this.phase.textContent=round.phase==='hiding'?'Hiding':round.phase==='seeking'?'Seeking':'Capsule revealed';this.clock.textContent=round.phase==='reveal'?'':`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  const roster=room.roster??room.players,hider=roster.find(p=>p.id===round.hiderId)?.name??'The street';
  const match=room.match,finished=match?.phase==='finished',showScores=Boolean(match&&(round.phase==='reveal'||finished));
  if(match?.announcement&&match.id!==this.announcedMatch){this.announcedMatch=match.id;this.announcementUntil=now+8000;this.announcement.textContent=match.announcement;}
  this.announcement.hidden=showScores||round.phase!=='hiding'||match?.roundNumber!==1||now>=this.announcementUntil;
  this.matchPanel.hidden=!showScores;this.hud.hidden=showScores;this.instruction.hidden=showScores;
  this.container.classList.toggle('showing-scores',showScores);
  if(showScores&&match){
   const text=(id:string,value:string)=>{const element=this.matchPanel.querySelector(id)!;if(element.textContent!==value)element.textContent=value;};
   const names=match.scores.filter(s=>match.winnerIds.includes(s.playerId)).map(s=>s.name);
   text('#match-title',finished?(names.length>1?'A shared victory':`${names[0]??'The street'} wins`):'Round complete');
   text('#match-rounds',`Round ${match.roundNumber} of ${match.totalRounds}`);
   const capsuleSpot=HIDING_SPOTS.find(s=>s.id===round.capsuleSpotId);
   text('#match-result',`${round.foundByName?`${round.foundByName} found the capsule.`:'Time is up. The capsule stayed hidden.'}${capsuleSpot?` ${capsuleSpot.name}, house ${Math.floor(HIDING_SPOTS.indexOf(capsuleSpot)/4)+1}.`:''}${finished?' One last night of summer, kept until next year.':''}`);
   text('#match-announcement',match.rosterChanged?'The group changed. Scores reset for the next round.':'');
   const ranked=match.scores.slice().sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name));
   this.scoreRows.forEach((row,i)=>{const score=ranked[i];row.hidden=!score;if(!score)return;row.dataset.playerId=score.playerId;row.querySelector('.score-name')!.textContent=score.name;row.querySelector('.score-total')!.textContent=String(score.score);row.querySelector('.score-earned')!.textContent=finished&&match.winnerIds.includes(score.playerId)?'Winner':`+${score.roundPoints}`;row.classList.toggle('winner',finished&&match.winnerIds.includes(score.playerId));});
   let best='';if(finished&&match.solo){const total=match.scores.find(s=>s.playerId===this.playerId)?.score??0;try{const stored=Number(localStorage.getItem('maple:solo-best:v1'))||0;const high=Math.max(stored,total);localStorage.setItem('maple:solo-best:v1',String(high));best=`Your best match: ${high}`;}catch{best=`Match score: ${total}`;}}
   text('#solo-best',best);text('#match-countdown',finished?'':`Next round in ${Math.max(0,Math.ceil(((match.nextRoundAt??round.phaseEndsAt)-now)/1000))}s`);
   this.replay.hidden=!finished;
  }
  const roleKey=`${match?.id}:${round.number}`;
  if(roleKey!==this.roleKey&&this.street.loaded){this.roleKey=roleKey;this.roleUntil=now+5000;this.roleCard.textContent=player.role==='waiting'?'Next round is yours. Pick up a flashlight while you wait.':player.role==='hider'?(round.phase==='seeking'||round.capsuleSpotId?'You are hiding. Leave misleading trails and stay out of the light.':'You are hiding. Bury the capsule before the timer ends.'):'Find the capsule. Footprints and disturbed ground only show in your light.';this.roleCard.style.animation='none';void this.roleCard.offsetWidth;this.roleCard.style.animation='';}
  this.roleCard.hidden=showScores||!this.street.loaded||now>=this.roleUntil;
  this.next.hidden=!showScores||finished||room.hostId!==this.playerId;
  this.next.disabled=now<(round.revealReadyAt??round.phaseEndsAt);
  const found=roster.find(p=>p.id===round.foundBy)?.name??round.foundByName;
  const revealed=HIDING_SPOTS.find(s=>s.id===round.capsuleSpotId);
  this.instruction.textContent=round.phase==='reveal'?`${found?`${found} found it.`:'Time is up.'} ${revealed?`${revealed.name}, house ${Math.floor(HIDING_SPOTS.indexOf(revealed)/4)+1}.`:''}${room.hostId!==this.playerId?' Explore until the next round.':''}`:
   player.role==='waiting'?(player.flashlight?'You join next round. Explore the room.':'You join next round. Pick up a flashlight and explore.'):
   player.place==='prep'?(player.flashlight?`${hider} is hiding. Explore the room.`:'Pick up a flashlight from the table.'):
   player.role==='hider'?(round.phase==='seeking'?'Stay on the street. The others are searching.':round.capsuleSpotId?'Capsule buried. Leave a trail or make decoy marks.':now<(room.blackoutAt??0)?'The lights are about to go out.':'Find a spot and bury the capsule.'):
   (player.cooldownUntil??0)>now?`Try another spot in ${Math.ceil((player.cooldownUntil!-now)/1000)}s.`:'Find a hiding spot. Hold Search for two seconds.';
  const offer=round.clueOffer;
  this.choices.hidden=!offer||showScores;
  Array.from(this.choices.children).forEach((child,i)=>{const option=offer?.options[i];child.textContent=option?.text??'';(child as HTMLButtonElement).disabled=!option;});
  this.choices.setAttribute('aria-label',`Send a true clue${offer?`: ${Math.max(0,Math.ceil((offer.deadlineAt-now)/1000))} seconds`:''}`);

  if((player.frozenUntil??0)>now)this.instruction.textContent='Caught in the light. Frozen for two seconds.';
  else if(player.role==='hider'&&round.phase==='seeking')this.instruction.textContent=`Lay a trail. ${round.decoysRemaining??0} decoy marks left.`;
  const pose=this.street.localPose;
  this.target=undefined;
  if(player.place==='prep'&&!player.flashlight&&Math.hypot(pose.x-FLASHLIGHT_PICKUP.x,pose.z-FLASHLIGHT_PICKUP.z)<=ACTION_RANGE)this.target={type:'pickup',name:'Pick up'};
  if(player.place==='street'&&round.phase!=='reveal'){
   const spot=HIDING_SPOTS.slice().sort((a,b)=>Math.hypot(a.x-pose.x,a.z-pose.z)-Math.hypot(b.x-pose.x,b.z-pose.z))[0];
   if(spot&&Math.hypot(spot.x-pose.x,spot.z-pose.z)<=ACTION_RANGE){
    if(player.role==='hider'&&round.phase==='hiding'&&!round.capsuleSpotId&&now>=(room.blackoutAt??0))this.target={type:'bury',spotId:spot.id,name:'Bury here',spotName:spot.name};
    if(player.role==='hider'&&round.capsuleSpotId&&spot.id!==round.capsuleSpotId&&(round.decoysRemaining??0)>0&&!(round.marks??[]).some(m=>Math.hypot(m.x-spot.x,m.z-spot.z)<.1))this.target={type:'disturb',spotId:spot.id,name:'Disturb',spotName:spot.name};
    if(player.role==='seeker'&&round.phase==='seeking'&&player.flashlight&&now>=(player.cooldownUntil??0))this.target={type:'search',spotId:spot.id,name:'Search',spotName:spot.name};
   }
  }
  this.button.hidden=showScores||!this.target||!this.street.loaded||(player.frozenUntil??0)>now;
  if(!this.button.hidden&&!this.actionTaught){this.actionTaught=true;this.attentionUntil=now+2600;try{localStorage.setItem('maple:action-taught:v1','yes');}catch{}}
  this.button.classList.toggle('action-attention',!this.button.hidden&&now<this.attentionUntil);
  this.button.querySelector('.action-name')!.textContent=this.target?.name??'';
  this.button.querySelector('.action-spot')!.textContent=this.target?.spotName??'';
  const search=player.search,progress=search&&this.held?Math.min(1,Math.max(0,(now-search.startedAt)/SEARCH_MS)):0;
  this.progress.style.transform=`scaleX(${progress})`;this.button.setAttribute('aria-label',this.target?.name??'Action');
  if(this.held&&(!this.target||this.target.type!=='search'||this.target.spotId!==search?.spotId&&search))this.release();
  if(this.held&&search&&now>=search.endsAt&&!this.completing){this.completing=true;const generation=this.generation;void this.send('search_complete',{spotId:search.spotId,roundNumber:this.heldRoundNumber}).finally(()=>{this.completing=false;if(generation===this.generation)this.release();});}
 }
 private begin=async()=>{
  if(this.held||!this.target||this.button.hidden)return;
  const target={...this.target};if(target.type!=='search'){await this.send(target.type,target.spotId?{spotId:target.spotId}:{});return;}
  this.held=true;this.heldRoundNumber=this.room?.round?.number??0;const roundNumber=this.heldRoundNumber,generation=++this.generation;
  const result=await this.send('search_begin',{spotId:target.spotId,roundNumber});
  if(!result.ok)this.release();else if(generation!==this.generation)await this.send('search_cancel',{roundNumber});
 };
 private down=(event:PointerEvent)=>{event.preventDefault();this.button.setPointerCapture(event.pointerId);void this.begin();};
 private up=()=>this.release();
 private release(){if(!this.held)return;this.held=false;this.generation++;this.progress.style.transform='scaleX(0)';void this.send('search_cancel',{roundNumber:this.heldRoundNumber});}
 private focusInput=()=>{if(document.activeElement instanceof HTMLElement&&document.activeElement.closest('input,textarea,[contenteditable="true"]'))this.release();};
 private keyDown=(event:KeyboardEvent)=>{if(event.key.toLowerCase()==='e'&&!event.repeat&&!(event.target instanceof HTMLElement&&event.target.closest('input,textarea,[contenteditable="true"]'))){event.preventDefault();void this.begin();}};
 private keyUp=(event:KeyboardEvent)=>{if(event.key.toLowerCase()==='e')this.release();};
 private visibility=()=>{if(document.hidden)this.release();};
 dispose(){document.removeEventListener('focusin',this.focusInput);clearInterval(this.timer);this.release();window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.up);document.removeEventListener('visibilitychange',this.visibility);}
}
