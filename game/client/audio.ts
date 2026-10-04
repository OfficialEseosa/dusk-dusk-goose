import type {RoomSnapshot} from '../shared/protocol';

export class NightSound {
  private context?:AudioContext;
  private master?:GainNode;
  private hum?:GainNode;
  private active=false;
  private lit:boolean|null=null;
  private room?:RoomSnapshot;
  private offset=0;
  muted=false;
  constructor(){
    document.addEventListener('pointerdown',()=>this.unlock());
    document.addEventListener('keydown',()=>this.unlock());
    document.addEventListener('visibilitychange',()=>this.volume());
    setInterval(()=>this.tick(),100);
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
    void this.context.resume().catch(()=>{});this.volume();
  }
  setRoom(room?:RoomSnapshot){this.room=room;this.active=room?.phase==='started';if(room)this.offset=room.serverTime-Date.now();if(!this.active)this.lit=null;this.tick();}
  toggle(){this.muted=!this.muted;this.unlock();this.volume();}
  private volume(){this.master?.gain.setTargetAtTime(this.muted||document.hidden?0:0.4,this.context!.currentTime,0.04);}
  private tick(){
    if(!this.context||!this.hum)return;
    const lit=this.active&&Date.now()+this.offset<(this.room?.blackoutAt??0);
    if(this.active&&!lit&&this.lit!==false)this.click();
    this.lit=this.active?lit:null;this.hum.gain.setTargetAtTime(lit?0.022:0,this.context.currentTime,0.04);
  }
  private crickets(){
    if(!this.context||!this.active||this.muted||document.hidden)return;
    const context=this.context;
    for(let i=0;i<3;i++){
      const time=context.currentTime+i*0.1;const chirp=context.createOscillator(),gain=context.createGain();
      chirp.frequency.setValueAtTime(3800+i*180,time);chirp.frequency.exponentialRampToValueAtTime(4700,time+0.05);
      gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(0.012,time+0.01);gain.gain.exponentialRampToValueAtTime(0.0001,time+0.08);
      chirp.connect(gain);gain.connect(this.master!);chirp.start(time);chirp.stop(time+0.09);chirp.onended=()=>{chirp.disconnect();gain.disconnect();};
    }
  }
  private click(){
    const context=this.context!;const buffer=context.createBuffer(1,Math.floor(context.sampleRate*0.035),context.sampleRate);const data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(1-i/data.length)*0.18;
    const source=context.createBufferSource();source.buffer=buffer;source.connect(this.master!);source.start();source.onended=()=>source.disconnect();
  }
}
