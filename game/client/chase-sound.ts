import {distance,angle,angleDelta,clearPath,TUNE,PARK,type ChaseSnapshot,type ChaseEvent,type Point} from '../shared/chase';

const FILES={lobby:'music/music_lobby',chase:'music/music_chase',finale:'music/music_finale',crickets:'music/amb_crickets',click1:'sfx/click_001',click2:'sfx/click_002',click3:'sfx/click_003',confirm:'sfx/confirmation_001',error:'sfx/error_001',join:'sfx/pluck_001',tick:'sfx/tick_001',go:'sfx/bong_001',lightOn:'sfx/switch_001',lightOff:'sfx/switch_002',grass1:'sfx/footstep_grass_000',grass2:'sfx/footstep_grass_001',pave1:'sfx/footstep_concrete_000',pave2:'sfx/footstep_concrete_001',impact:'sfx/impactSoft_heavy_000',freeze:'sfx/zap1',pickup:'sfx/powerUp1',down:'sfx/phaserDown1',thaw:'sfx/drop_001',reconnect:'sfx/glitch_001',win:'jingles/jingles_NES00',lose:'jingles/jingles_NES01',best:'jingles/jingles_PIZZI01'} as const;
type Cue=keyof typeof FILES;
type Voice={source:AudioBufferSourceNode;gain:GainNode;cue:Cue};
/** Gesture-unlocked, bounded Web Audio mixer. No gameplay timing depends on audio. */
export class ChaseSound {
  private context?:AudioContext;private master?:GainNode;private music?:GainNode;private sfx?:GainNode;private ambience?:GainNode;
  private buffers=new Map<Cue,AudioBuffer>();private voices=new Set<Voice>();private loops:{source:AudioBufferSourceNode;gain:GainNode}[]=[];private noise?:AudioBuffer;
  private musicAfter=0;private clickIndex=-1;private finaleSecond=-1;private nextHum=0;private nextFizz=0;private wanted:Cue='lobby';private current?:Cue;private nextLoop=0;private ambSource?:AudioBufferSourceNode;
  private snapshot?:ChaseSnapshot;private id='';private local:Point={x:0,z:0};private run='';private lastEvent=0;private ownLight=false;private ownBattery=100;private lastPos?:Point;
  private nextStep=0;private step=0;private nextBeat=0;private nextLow=0;private nextHonk=0;private honkVoices=0;private countdown='';private bestRun='';private muted=false;
  constructor(){try{this.muted=JSON.parse(localStorage.getItem('ddg-audio')??'{}').muted===true;}catch{}
    document.addEventListener('pointerdown',e=>{this.unlock();if((e.target as HTMLElement).closest('button')){this.clickIndex=(this.clickIndex+1+Math.floor(Math.random()*2))%3;const cue=(['click1','click2','click3'] as const)[this.clickIndex];if(this.buffers.has(cue))this.cue(cue,.4,0,.96+Math.random()*.08);else if(this.context)void this.context.resume().then(()=>this.tone(900,.055,.06)).catch(()=>{});}});document.addEventListener('keydown',e=>{if((e.target as HTMLElement).tagName==='INPUT')return;this.unlock();if(e.code==='KeyM'&&!e.repeat){this.muted=!this.muted;try{localStorage.setItem('ddg-audio',JSON.stringify({muted:this.muted}));}catch{}this.volume();}});
    document.addEventListener('visibilitychange',()=>{if(!this.context)return;this.volume();if(document.hidden){this.stopMusic();for(const voice of this.voices){try{voice.source.stop();}catch{}}this.voices.clear();this.countdown='';void this.context.suspend().catch(()=>{});}else {this.nextLoop=0;void this.context.resume().catch(()=>{});}});
    window.addEventListener('pageshow',()=>{if(this.context&&!document.hidden)void this.context.resume().catch(()=>{});});setInterval(()=>this.tick(),80);
  }
  unlock(){if(!this.context){try{
      const session=(navigator as Navigator&{audioSession?:{type:string}}).audioSession;if(session)session.type='playback';
      const ctx=this.context=new AudioContext(),master=this.master=ctx.createGain(),limiter=ctx.createDynamicsCompressor();master.gain.value=this.muted?0:.7;limiter.threshold.value=-6;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.25;master.connect(limiter).connect(ctx.destination);
      this.music=ctx.createGain();this.music.gain.value=.23;this.music.connect(master);this.sfx=ctx.createGain();this.sfx.gain.value=.8;this.sfx.connect(master);this.ambience=ctx.createGain();this.ambience.gain.value=.1;this.ambience.connect(master);
      this.noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.5),ctx.sampleRate);const samples=this.noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
      const silent=ctx.createBufferSource();silent.buffer=ctx.createBuffer(1,1,ctx.sampleRate);silent.connect(master);silent.start();
      void Promise.allSettled(Object.entries(FILES).map(async([cue,path])=>{const response=await fetch(`/assets/chase/audio/${path}.mp3`);if(!response.ok)throw new Error(`Audio ${cue}: ${response.status}`);this.buffers.set(cue as Cue,await ctx.decodeAudioData(await response.arrayBuffer()));})).then(()=>this.tick());
    }catch{return;}}
    void this.context.resume().then(()=>this.volume()).catch(()=>{});
  }
  private volume(){if(!this.context||!this.master)return;this.master.gain.cancelScheduledValues(this.context.currentTime);this.master.gain.setTargetAtTime(this.muted||document.hidden?0:.7,this.context.currentTime,.02);}
  private audible(){return !!this.context&&this.context.state==='running'&&!document.hidden&&!this.muted;}
  cue(cue:Cue,volume=.6,pan=0,rate=1,delay=0){const ctx=this.context,buffer=this.buffers.get(cue);if(!ctx||!buffer||!this.audible())return;
    const cap=/grass|pave|click/.test(cue)?2:4;if(this.voices.size>=28||[...this.voices].filter(v=>v.cue===cue).length>=cap)return;
    const source=ctx.createBufferSource(),gain=ctx.createGain(),panner=ctx.createStereoPanner();source.buffer=buffer;source.playbackRate.value=rate;gain.gain.value=volume;panner.pan.value=Math.max(-.8,Math.min(.8,pan));source.connect(gain).connect(panner).connect(this.sfx!);gain.gain.value/=Math.sqrt(1+[...this.voices].filter(v=>v.cue===cue).length);const voice={source,gain,cue};this.voices.add(voice);source.onended=()=>{this.voices.delete(voice);source.disconnect();gain.disconnect();panner.disconnect();};source.start(ctx.currentTime+delay);
  }
  private tone(frequency:number,duration:number,gainValue:number,delay=0){const ctx=this.context;if(!ctx||!this.audible())return;const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+delay;osc.type='triangle';osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(frequency*.65,t+duration);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(gainValue,t+.01);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain).connect(this.sfx!);osc.start(t);osc.stop(t+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
  private noiseCue(duration:number,volume:number,pan=0){const ctx=this.context;if(!ctx||!this.noise||!this.audible())return;const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),panner=ctx.createStereoPanner(),t=ctx.currentTime;source.buffer=this.noise;filter.type='bandpass';filter.frequency.value=1600;filter.Q.value=.7;gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);panner.pan.value=Math.max(-.8,Math.min(.8,pan));source.connect(filter).connect(gain).connect(panner).connect(this.sfx!);source.start(t);source.stop(t+duration);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();panner.disconnect();};}
  honk(pitch=1,volume=.65,pan=0){const ctx=this.context;if(!ctx||!this.audible()||this.honkVoices>=4)return;this.honkVoices++;const t=ctx.currentTime,gain=ctx.createGain(),filter=ctx.createBiquadFilter(),panner=ctx.createStereoPanner();filter.type='bandpass';filter.frequency.value=710*pitch;filter.Q.value=1.8;panner.pan.value=Math.max(-.8,Math.min(.8,pan));gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume*.22,t+.035);gain.gain.setValueAtTime(volume*.18,t+.16);gain.gain.exponentialRampToValueAtTime(.0001,t+.36);filter.connect(gain).connect(panner).connect(this.sfx!);
    for(let i=0;i<2;i++){const osc=ctx.createOscillator();osc.type='sawtooth';osc.frequency.setValueAtTime((260+i*4)*pitch,t);osc.frequency.exponentialRampToValueAtTime((190+i*3)*pitch,t+.32);osc.connect(filter);osc.start(t);osc.stop(t+.38);osc.onended=()=>{osc.disconnect();if(i===1){this.honkVoices--;filter.disconnect();gain.disconnect();panner.disconnect();}};}
  }
  private duck(){const ctx=this.context;if(!ctx||!this.music)return;this.music.gain.cancelScheduledValues(ctx.currentTime);this.music.gain.setTargetAtTime(.07,ctx.currentTime,.025);this.music.gain.setTargetAtTime(.23,ctx.currentTime+.8,.2);}
  private event(e:ChaseEvent){const own=e.actor===this.id||e.target===this.id,d=distance(e,this.local),gain=own?1:Math.max(.05,1-d/18)**2,pan=(e.x-this.local.x)/12;
    if(e.type==='windup'){this.honk(1.05,gain*.7,pan);this.noiseCue(.18,.13*gain,pan);}
    if(e.type==='freeze'){this.cue('freeze',gain*.8,pan,1+(Math.random()-.5)*.08);this.honk(1.4,gain*.5,pan);}
    if(e.type==='catch'){this.cue('impact',gain*.75,pan);this.noiseCue(.35,.32*gain,pan);this.honk(e.target===this.id?1.25:.9,gain,pan);if(own)this.duck();}
    if(e.type==='miss'){this.noiseCue(.18,.15*gain,pan);this.honk(.72,.35*gain,pan);}
    if(e.type==='near'){this.noiseCue(.15,.25*gain,pan);if(e.target===this.id)this.tone(350,.12,.12);}
    if(e.type==='thaw'){this.cue('thaw',gain*.4,pan);this.noiseCue(.2,.07*gain,pan);}
    if(e.type==='pickup')this.cue('pickup',gain*.65,pan);
    if(e.type==='spawn'){this.honk(.85+(e.id%4)*.1,.7,pan);this.noiseCue(.2,.16,pan);}
    if(e.type==='hour')this.cue('confirm',.65,0,1.1);
    if(e.type==='dawn'){this.tone(520,.2,.16);this.tone(780,.3,.14,.15);this.honk(1.25,.5);}
    if(e.type==='flock'){this.honk(.85,.55,-.6);this.honk(1.1,.45,.6);this.honk(.95,.35);}
  }
  update(s:ChaseSnapshot|undefined,id:string,local:Point){this.local=local;this.id=id;const previous=this.snapshot;this.snapshot=s;if(!s){this.wanted='lobby';return;}
    const run=s.solo?.runId??s.multi?.runId??'',me=s.entities.find(e=>e.id===id);if(!me)return;
    if(run!==this.run){this.lastEvent=previous?0:s.events.at(-1)?.id??0;this.run=run;this.ownLight=false;this.ownBattery=100;this.lastPos={...local};this.countdown='';this.finaleSecond=-1;if(s.multi?.stage!=='countdown')this.cue('go',.7);}
    for(const e of s.events)if(e.id>this.lastEvent){this.lastEvent=e.id;this.event(e);}
    if(previous?.code===s.code){for(let i=0;i<s.pickups.length;i++){const p=s.pickups[i];if(p.readyAt<=s.now&&(previous.pickups[i]?.readyAt??0)>previous.now)this.cue('confirm',.25,(p.x-this.local.x)/12,1.25);}const oldHumans=previous.entities.filter(e=>!e.bot),humans=s.entities.filter(e=>!e.bot);if(humans.some(e=>!oldHumans.some(p=>p.id===e.id)))this.cue('join',.5,0,1+.06*Math.min(5,humans.length-1));if(oldHumans.some(e=>!humans.some(p=>p.id===e.id)))this.cue('thaw',.35,0,.8);if(s.lamps?.some((lamp,i)=>lamp.active&&!previous.lamps?.[i]?.active))this.cue('confirm',.45);if(s.lamps?.some((lamp,i)=>!lamp.active&&previous.lamps?.[i]?.active))this.cue('down',.35,0,1.4);if(s.multi?.lastKid&&!previous.multi?.lastKid){this.cue('pickup',.6);this.tone(780,.18,.1,.1);}}
    const playing=s.phase==='playing'&&(!s.multi||s.multi.stage==='playing');this.wanted=playing?s.elapsed>=60?'finale':'chase':'lobby';
    if(me.light!==this.ownLight){this.cue(me.light?'lightOn':'lightOff',.45);this.ownLight=me.light;}
    if(me.battery<10&&this.ownBattery>=10)this.cue('down',.55,0,1.8);this.ownBattery=me.battery;
    if(s.phase==='results'&&previous?.phase!=='results'){this.stopMusic();this.musicAfter=(this.context?.currentTime??0)+2;this.cue(me.role==='kid'?'win':'lose',.7);if(s.multi)for(let i=0;i<6;i++)this.cue('tick',.22,0,1+i*.06,.6+i*.12);}
    if(playing&&s.multi){const left=Math.max(0,Math.ceil((s.multi.deadline-s.multi.serverTime)/1000));if(left<=10&&left>0&&left!==this.finaleSecond){this.finaleSecond=left;this.cue('tick',.6,0,1+(10-left)*.045);}}
    if(s.multi?.stage==='countdown'&&this.countdown!==run){this.countdown=run;const left=(s.multi.deadline-s.multi.serverTime)/1000;for(let i=1;i<=3;i++)if(left>=i-.1)this.cue('tick',.65,0,1,left-i);this.cue('go',.8,0,1,Math.max(0,left));this.cue('down',.5,0,1.2,Math.max(0,left));}
  }
  newBest(){if(this.run===this.bestRun)return;this.bestRun=this.run;this.cue('best',.6);}
  private stopMusic(){const ctx=this.context;if(!ctx)return;for(const v of this.loops){v.gain.gain.cancelScheduledValues(ctx.currentTime);v.gain.gain.setTargetAtTime(.0001,ctx.currentTime,.015);try{v.source.stop(ctx.currentTime+.08);}catch{}}this.loops=[];this.current=undefined;this.nextLoop=0;}
  private tick(){const ctx=this.context;if(!ctx||!this.audible())return;const now=ctx.currentTime;
    if(now>=this.musicAfter&&this.current!==this.wanted&&this.buffers.has(this.wanted)){for(const v of this.loops){v.gain.gain.cancelScheduledValues(now);v.gain.gain.setTargetAtTime(.0001,now,.08);try{v.source.stop(now+.35);}catch{}}this.loops=[];this.current=this.wanted;this.nextLoop=now;}
    if(this.current&&this.nextLoop<now+.25){const buffer=this.buffers.get(this.current);if(buffer){const source=ctx.createBufferSource(),gain=ctx.createGain(),t=Math.max(now,this.nextLoop);source.buffer=buffer;gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(1,t+.1);gain.gain.setValueAtTime(1,t+buffer.duration-.15);gain.gain.linearRampToValueAtTime(.0001,t+buffer.duration);source.connect(gain).connect(this.music!);source.start(t);this.nextLoop=t+buffer.duration-.1;const voice={source,gain};this.loops.push(voice);source.onended=()=>{this.loops=this.loops.filter(v=>v!==voice);source.disconnect();gain.disconnect();};}}
    if(!this.ambSource&&this.buffers.has('crickets')){const source=ctx.createBufferSource();source.buffer=this.buffers.get('crickets')!;source.loop=true;source.loopStart=.04;source.loopEnd=Math.max(.05,source.buffer.duration-.08);source.connect(this.ambience!);source.start();this.ambSource=source;}
    const s=this.snapshot,me=s?.entities.find(e=>e.id===this.id);if(!s||!me)return;let nearest=Infinity;for(const e of s.entities)if(e.role==='goose'&&e.id!==this.id)nearest=Math.min(nearest,distance(e,this.local));this.ambience!.gain.setTargetAtTime(nearest<8?0:.1,now,.3);
    if(me.role==='kid'&&s.phase==='playing'&&nearest<12&&now>=this.nextBeat){const gain=nearest<4?.16:nearest<8?.09:.04;this.tone(72,.11,gain);this.tone(58,.1,gain*.7,.12);this.nextBeat=now+(nearest<4?.42:nearest<8?.72:1.1);}
    if(me.role==='kid'&&me.light&&s.phase==='playing'&&now>=this.nextHum){this.tone(110,.12,.008);this.nextHum=now+.11;}
    if(me.role==='kid'&&me.light&&s.entities.some(g=>g.role==='goose'&&g.frozenUntil<=s.now&&g.immuneUntil<=s.now&&distance(g,this.local)<TUNE.range&&Math.abs(angleDelta(me.aim,angle(this.local,g)))<TUNE.halfCone&&clearPath(this.local,g,PARK,0,true))&&now>=this.nextFizz){this.noiseCue(.09,.035);this.nextFizz=now+.12;}
    if(me.role==='kid'&&me.battery<25&&s.phase==='playing'&&now>=this.nextLow){this.tone(620,.08,.1);this.tone(440,.1,.1,.15);this.nextLow=now+2;}
    if(s.phase==='playing'&&now>=this.nextHonk){const g=s.entities.find(e=>e.role==='goose'&&distance(e,this.local)<14);if(g)this.honk(.85+(g.personality%4)*.1,.4*(1-distance(g,this.local)/18),(g.x-this.local.x)/12);this.nextHonk=now+3;}
    if(this.lastPos&&distance(this.lastPos,this.local)>.15&&now>=this.nextStep&&s.phase==='playing'){const pave=Math.abs(this.local.z)>5||Math.abs(Math.abs(this.local.x)-4.4)<1;this.cue((pave?this.step%2?'pave1':'pave2':this.step%2?'grass1':'grass2'),.25,0,.94+Math.random()*.12);this.step++;this.nextStep=now+.15;}this.lastPos={...this.local};
  }
}
