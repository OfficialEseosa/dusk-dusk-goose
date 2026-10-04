import type {RoomSnapshot} from '../shared/protocol';

/** Local synthesis keeps the sound bank small; authoritative state owns event timing. */
export class NightSound {
  private context?:AudioContext;
  private master?:GainNode;
  private hum?:GainNode;
  private active=false;
  private lit:boolean|null=null;
  private room?:RoomSnapshot;
  private playerId='';
  private offset=0;
  private movement=false;
  private place:'prep'|'street'='street';
  private nextStep=0;
  private nextRummage=0;
  private pendingFinal=false;
  private playedFinal='';
  private seenRadio=new Set<string>();
  muted=false;
  constructor(){
    document.addEventListener('pointerdown',()=>this.unlock());
    document.addEventListener('keydown',()=>this.unlock());
    document.addEventListener('visibilitychange',()=>{this.movement=false;this.volume();if(!document.hidden&&this.context)void this.context.resume().then(()=>this.playPendingFinal()).catch(()=>{});});
    setInterval(()=>this.tick(),80);
    setInterval(()=>this.crickets(),1200);
  }
  unlock(){
    if(!this.context){
      try{
        this.context=new AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);
        this.hum=this.context.createGain();this.hum.gain.value=0;this.hum.connect(this.master);
        for(const frequency of [60,120]){const oscillator=this.context.createOscillator();oscillator.frequency.value=frequency;oscillator.connect(this.hum);oscillator.start();}
      }catch{return;}
    }
    void this.context.resume().then(()=>{this.volume();this.playPendingFinal();}).catch(()=>{});this.volume();
  }
  setMovement(moving:boolean,place:'prep'|'street'='street'){
    if(moving&&!this.movement)this.nextStep=0;
    this.movement=moving;this.place=place;
  }
  setRoom(room?:RoomSnapshot,playerId=''){
    const previous=this.room,wasActive=this.active,now=room?.serverTime??Date.now();
    const sameRoom=previous?.code===room?.code;
    if(previous?.match?.id!==room?.match?.id||room?.match?.phase!=='finished')this.pendingFinal=false;
    this.room=room;this.playerId=playerId;this.active=room?.phase==='started';if(wasActive!==this.active)this.volume();
    if(room)this.offset=room.serverTime-Date.now();
    if(!room||!this.active){this.lit=null;this.movement=false;this.seenRadio.clear();this.pendingFinal=false;this.tick();return;}
    const initial=!sameRoom||!previous?.round;
    const radio=(room as RoomSnapshot&{radio?:{id:string;sentAt:number}[]}).radio??room.round?.clues??[];
    if(initial){this.seenRadio=new Set(radio.map(message=>message.id));this.lit=now<(room.blackoutAt??0);this.pendingFinal=room.match?.phase==='finished'&&this.playedFinal!==room.match.id;this.playPendingFinal();}
    else{
      for(const message of radio)if(!this.seenRadio.has(message.id)){this.seenRadio.add(message.id);if(now-message.sentAt<3000)this.radioCrackle();}
      // The protocol history is bounded; retain only current IDs so this set is bounded too.
      this.seenRadio=new Set(radio.map(message=>message.id));
      if(room.round?.number!==previous.round?.number)this.roundStart();
      for(const player of room.players){const old=previous.players.find(p=>p.id===player.id);if((player.frozenUntil??0)>now&&(player.frozenUntil??0)>(old?.frozenUntil??0))this.freeze();}
      const own=room.players.find(p=>p.id===playerId),oldOwn=previous.players.find(p=>p.id===playerId);
      if(own?.flashlight&&!oldOwn?.flashlight)this.click();
      if(room.round?.phase==='reveal'&&previous.round?.phase!=='reveal'){
        if(room.round.foundBy)this.found();else this.roundEnd();
      }
      if(room.match?.phase==='finished'&&previous.match?.phase!=='finished'&&this.playedFinal!==room.match.id){this.closing();this.playedFinal=room.match.id;}
    }
    if(initial&&this.context&&now-(room.startedAt??0)<2000)this.roundStart();
    this.tick();
  }
  private playPendingFinal(){if(this.pendingFinal&&this.room?.match?.phase==='finished'&&this.audible()){this.pendingFinal=false;this.closing();this.playedFinal=this.room?.match?.id??'';}}
  toggle(){this.muted=!this.muted;this.unlock();this.volume();}
  private audible(){return Boolean(this.active&&this.context&&this.master&&!this.muted&&!document.hidden&&this.context.state==='running');}
  private volume(){
    if(!this.context||!this.master)return;
    const time=this.context.currentTime;this.master.gain.cancelScheduledValues(time);
    // Zero immediately, including the tail of every previously scheduled sound.
    if(this.muted||document.hidden||!this.active)this.master.gain.setValueAtTime(0,time);
    else this.master.gain.setTargetAtTime(.4,time,.008);
  }
  private tick(){
    const now=Date.now()+this.offset,lit=this.active&&now<(this.room?.blackoutAt??0);
    if(this.active&&this.lit===true&&!lit)this.click();
    this.lit=this.active?lit:null;
    if(!this.context||!this.hum)return;
    this.hum.gain.setTargetAtTime(lit ? .022 : 0,this.context.currentTime,.04);
    if(!this.active||!this.audible())return;
    if(this.movement&&now>=this.nextStep){this.nextStep=now+340;this.footstep();}
    const own=this.room?.players.find(player=>player.id===this.playerId);
    if(own?.search&&own.search.endsAt>now&&now>=this.nextRummage){this.nextRummage=now+260;this.rummage();}
  }
  private noise(duration:number,volume:number,frequency:number,type:BiquadFilterType='lowpass'){
    if(!this.audible())return;
    const context=this.context!,buffer=context.createBuffer(1,Math.floor(context.sampleRate*duration),context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++){const t=i/data.length;data[i]=(Math.random()*2-1)*Math.sin(Math.PI*t)*(1-t);}
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=buffer;filter.type=type;filter.frequency.value=frequency;filter.Q.value=.6;gain.gain.value=volume;
    source.connect(filter);filter.connect(gain);gain.connect(this.master!);source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  private notes(notes:{frequency:number;at:number;duration:number;gain?:number}[]){
    if(!this.audible())return;
    const context=this.context!,start=context.currentTime;
    for(const note of notes){
      const time=start+note.at,oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=note.frequency;
      gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(note.gain??.065,time+.012);gain.gain.exponentialRampToValueAtTime(.0001,time+note.duration);
      oscillator.connect(gain);gain.connect(this.master!);oscillator.start(time);oscillator.stop(time+note.duration+.015);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    }
  }
  private footstep(){this.noise(.105,this.place==='prep' ? .14 : .18,this.place==='prep' ? 480 : 950);}
  private rummage(){this.noise(.19,.115,1600,'bandpass');}
  private roundStart(){this.notes([{frequency:392,at:0,duration:.24},{frequency:523.25,at:.17,duration:.35}]);}
  private roundEnd(){this.notes([{frequency:392,at:0,duration:.42},{frequency:293.66,at:.25,duration:.6}]);}
  private found(){this.notes([{frequency:523.25,at:0,duration:.34},{frequency:659.25,at:.13,duration:.4},{frequency:783.99,at:.27,duration:.65}]);}
  private freeze(){this.notes([{frequency:880,at:0,duration:.16,gain:.075},{frequency:440,at:.12,duration:.42,gain:.065}]);}
  private closing(){this.notes([{frequency:392,at:.35,duration:.7},{frequency:523.25,at:.7,duration:.7},{frequency:659.25,at:1.05,duration:.75},{frequency:523.25,at:1.45,duration:1.05},{frequency:261.63,at:1.45,duration:1.05,gain:.04}]);}
  private crickets(){
    if(!this.active||!this.audible())return;
    const context=this.context!;
    for(let i=0;i<3;i++){
      const time=context.currentTime+i*.1,chirp=context.createOscillator(),gain=context.createGain();
      chirp.frequency.setValueAtTime(3800+i*180,time);chirp.frequency.exponentialRampToValueAtTime(4700,time+.05);
      gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(.012,time+.01);gain.gain.exponentialRampToValueAtTime(.0001,time+.08);
      chirp.connect(gain);gain.connect(this.master!);chirp.start(time);chirp.stop(time+.09);chirp.onended=()=>{chirp.disconnect();gain.disconnect();};
    }
  }
  searchNoise(){
    if(!this.audible())return;
    const context=this.context!,time=context.currentTime,oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type='triangle';oscillator.frequency.setValueAtTime(180,time);oscillator.frequency.exponentialRampToValueAtTime(55,time+.3);
    gain.gain.setValueAtTime(.15,time);gain.gain.exponentialRampToValueAtTime(.001,time+.35);
    oscillator.connect(gain);gain.connect(this.master!);oscillator.start(time);oscillator.stop(time+.36);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  radioCrackle(){this.noise(.32,.10,1400,'bandpass');}
  private click(){this.noise(.035,.18,3300,'highpass');}
}
