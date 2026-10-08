export type QualityTier='low'|'medium'|'high';
const caps={low:1,medium:1.5,high:2};
/** Allocation-free frame sampler. Hidden time and hit-stop never lower quality. */
export class ChaseQuality {
  tier:QualityTier;ratio:number;
  private sum=0;private frames=0;private previous=0;private cooldown=0;private fastSince=0;private floors=0;private titleChecked=false;
  constructor(mobile:boolean,private dpr:number){this.tier=mobile?'medium':'high';this.ratio=Math.min(dpr,caps[this.tier]);}
  frame(now:number,title:boolean,paused=false){
    if(paused){this.previous=0;this.sum=0;this.frames=0;this.fastSince=0;return false;}
    const elapsed=this.previous?now-this.previous:0;this.previous=now;
    if(elapsed<=0)return false;
    // Bound a single stall, but retain active slow frames: dropping them can
    // prevent a struggling GPU from ever accumulating a quality sample.
    this.sum+=Math.min(elapsed,250);this.frames++;
    // RAF on a healthy 60Hz screen is ~16.7ms, even with spare GPU capacity.
    if(elapsed<18)this.fastSince||=now;else this.fastSince=0;
    if(this.frames<(title&&!this.titleChecked?120:60)&&this.sum<2000)return false;
    const average=this.sum/this.frames;this.sum=0;this.frames=0;
    const before=this.ratio;
    if(title&&!this.titleChecked){this.titleChecked=true;if(average>40)this.tier='low';else if(average>24)this.tier=this.tier==='high'?'medium':'low';this.ratio=Math.min(this.ratio,this.dpr,caps[this.tier]);}
    if(now>=this.cooldown){
      const cap=Math.min(this.dpr,caps[this.tier]),floor=cap*.6;
      if(average>22){this.ratio=Math.max(floor,this.ratio*.85);this.cooldown=now+2000;
        if(this.ratio<=floor+.001&&++this.floors>=2&&this.tier!=='low'){this.tier='low';this.ratio=Math.min(this.ratio,this.dpr);this.floors=0;}}
      else if(average<18&&this.fastSince&&now-this.fastSince>=4000){this.ratio=Math.min(cap,this.ratio*1.1);this.cooldown=now+2000;}
    }
    return Math.abs(before-this.ratio)>.001;
  }
}
