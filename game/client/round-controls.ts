import type {RoomSnapshot} from '../shared/protocol';
import {HIDING_SPOTS,FLASHLIGHT_PICKUP,ACTION_RANGE,SEARCH_MS} from '../shared/round';
import type {Street} from './street';

type Reply={ok:boolean;error?:{message:string}};
/** Persistent controls: snapshots change state and text, never the input elements. */
export class RoundControls {
 private room?:RoomSnapshot;
 private offset=0;
 private held=false;
 private generation=0;
 private heldRoundNumber=0;
 private completing=false;
 private timer:ReturnType<typeof setInterval>;
 private target?:{type:'pickup'|'bury'|'search';spotId?:string;name:string;spotName?:string};
 private readonly button:HTMLButtonElement;
 private readonly progress:HTMLSpanElement;
 private readonly phase:HTMLElement;
 private readonly clock:HTMLElement;
 private readonly instruction:HTMLElement;
 private readonly next:HTMLButtonElement;
 constructor(private container:HTMLElement,private street:Street,private playerId:string,private send:(type:string,fields?:Record<string,unknown>)=>Promise<Reply>){
  const panel=document.createElement('div');panel.className='round-hud';panel.innerHTML='<span id="round-phase"></span><strong id="round-clock" aria-label="Time remaining"></strong><p id="round-instruction"></p>';
  container.append(panel);this.phase=panel.querySelector('#round-phase')!;this.clock=panel.querySelector('#round-clock')!;this.instruction=panel.querySelector('#round-instruction')!;
  this.button=document.createElement('button');this.button.id='round-action';this.button.className='round-action';this.button.hidden=true;
  this.button.innerHTML='<span class="action-progress"></span><span class="action-name"></span><small class="action-spot"></small><small class="action-key">E</small>';container.append(this.button);this.progress=this.button.querySelector('.action-progress')!;
  this.next=document.createElement('button');this.next.id='next-round';this.next.textContent='Start next round';this.next.className='next-round';this.next.hidden=true;container.append(this.next);this.next.addEventListener('click',()=>void this.send('start'));
  this.button.addEventListener('pointerdown',this.down);this.button.addEventListener('pointerup',this.up);this.button.addEventListener('pointercancel',this.up);this.button.addEventListener('lostpointercapture',this.up);
  window.addEventListener('keydown',this.keyDown);window.addEventListener('keyup',this.keyUp);window.addEventListener('blur',this.up);document.addEventListener('visibilitychange',this.visibility);
  this.timer=setInterval(()=>this.tick(),50);
 }
 update(room:RoomSnapshot){const changed=this.room?.round?.number!==room.round?.number||this.room?.round?.phase!==room.round?.phase;this.room=room;this.offset=room.serverTime-Date.now();if(changed)this.release();this.tick();}
 private tick(){
  const room=this.room,round=room?.round,player=room?.players.find(p=>p.id===this.playerId);if(!round||!player||!room)return;
  const now=Date.now()+this.offset,seconds=Math.max(0,Math.ceil((round.phaseEndsAt-now)/1000));
  this.phase.textContent=round.phase==='hiding'?'Hiding':round.phase==='seeking'?'Seeking':'Capsule revealed';this.clock.textContent=round.phase==='reveal'?'':`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  const roster=room.roster??room.players,hider=roster.find(p=>p.id===round.hiderId)?.name??'The street';
  this.next.hidden=round.phase!=='reveal'||room.hostId!==this.playerId;
  this.next.disabled=now<(round.revealReadyAt??round.phaseEndsAt);
  const found=roster.find(p=>p.id===round.foundBy)?.name??round.foundByName;
  const revealed=HIDING_SPOTS.find(s=>s.id===round.capsuleSpotId);
  this.instruction.textContent=round.phase==='reveal'?`${found?`${found} found it.`:'Time is up.'} ${revealed?`${revealed.name}, house ${Math.floor(HIDING_SPOTS.indexOf(revealed)/4)+1}.`:''}${room.hostId!==this.playerId?' Explore until the next round.':''}`:
   player.role==='waiting'?(player.flashlight?'You join next round. Explore the room.':'You join next round. Pick up a flashlight and explore.'):
   player.place==='prep'?(player.flashlight?`${hider} is hiding. Explore the room.`:'Pick up a flashlight from the table.'):
   player.role==='hider'?(round.phase==='seeking'?'Stay on the street. The others are searching.':round.capsuleSpotId?'Capsule buried. Keep exploring.':now<(room.blackoutAt??0)?'The lights are about to go out.':'Find a spot and bury the capsule.'):
   (player.cooldownUntil??0)>now?`Try another spot in ${Math.ceil((player.cooldownUntil!-now)/1000)}s.`:'Find a hiding spot. Hold Search for two seconds.';
  const pose=this.street.localPose;
  this.target=undefined;
  if(player.place==='prep'&&!player.flashlight&&Math.hypot(pose.x-FLASHLIGHT_PICKUP.x,pose.z-FLASHLIGHT_PICKUP.z)<=ACTION_RANGE)this.target={type:'pickup',name:'Pick up'};
  if(player.place==='street'&&round.phase!=='reveal'){
   const spot=HIDING_SPOTS.slice().sort((a,b)=>Math.hypot(a.x-pose.x,a.z-pose.z)-Math.hypot(b.x-pose.x,b.z-pose.z))[0];
   if(spot&&Math.hypot(spot.x-pose.x,spot.z-pose.z)<=ACTION_RANGE){
    if(player.role==='hider'&&round.phase==='hiding'&&!round.capsuleSpotId&&now>=(room.blackoutAt??0))this.target={type:'bury',spotId:spot.id,name:'Bury here',spotName:spot.name};
    if(player.role==='seeker'&&round.phase==='seeking'&&player.flashlight&&now>=(player.cooldownUntil??0))this.target={type:'search',spotId:spot.id,name:'Search',spotName:spot.name};
   }
  }
  this.button.hidden=!this.target||!this.street.loaded;
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
 private keyDown=(event:KeyboardEvent)=>{if(event.key.toLowerCase()==='e'&&!event.repeat&&!(event.target instanceof HTMLInputElement)){event.preventDefault();void this.begin();}};
 private keyUp=(event:KeyboardEvent)=>{if(event.key.toLowerCase()==='e')this.release();};
 private visibility=()=>{if(document.hidden)this.release();};
 dispose(){clearInterval(this.timer);this.release();window.removeEventListener('keydown',this.keyDown);window.removeEventListener('keyup',this.keyUp);window.removeEventListener('blur',this.up);document.removeEventListener('visibilitychange',this.visibility);}
}
