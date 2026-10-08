/** Optional browser affordances; failure never prevents room entry. */
export class ChaseDisplay {
  private begun=false;private dismissed=false;private wake?:WakeLockSentinel;
  private readonly coarse=matchMedia('(pointer: coarse)').matches;
  get portrait(){return innerHeight>innerWidth;}
  constructor(private hint:HTMLElement,private home:HTMLElement,private releaseInput:()=>void){
    try{this.dismissed=localStorage.getItem('ddg-home-tip')==='dismissed';}catch{}
    home.onclick=()=>{home.hidden=true;this.dismissed=true;try{localStorage.setItem('ddg-home-tip','dismissed');}catch{}};
    window.addEventListener('resize',()=>this.orientation());document.addEventListener('fullscreenchange',()=>this.orientation());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&this.begun)void this.keepAwake();});
    document.addEventListener('keydown',event=>{if(event.code==='KeyF'&&!event.repeat&&(event.target as HTMLElement).tagName!=='INPUT'){event.preventDefault();void this.toggleFullscreen();}});
    this.orientation();
  }
  private orientation(){this.hint.hidden=!this.portrait;if(this.portrait)this.releaseInput();}
  enter(){this.begun=true;if(!this.coarse)return;void this.keepAwake();if(matchMedia('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone)return;if(!document.fullscreenElement)void this.toggleFullscreen();}
  private async toggleFullscreen(){try{
    if(document.fullscreenElement){await document.exitFullscreen();return;}
    if(!document.documentElement.requestFullscreen)throw new Error('Fullscreen unavailable');
    await document.documentElement.requestFullscreen({navigationUI:'hide'});this.home.hidden=true;
    if(this.coarse){const orientation=screen.orientation as ScreenOrientation&{lock?:(mode:string)=>Promise<void>};try{await orientation.lock?.('landscape');}catch{}}
  }catch{if(this.coarse&&!this.dismissed)this.home.hidden=false;}}
  private async keepAwake(){if(!this.coarse||document.hidden||this.wake)return;try{this.wake=await navigator.wakeLock?.request('screen');this.wake?.addEventListener('release',()=>{this.wake=undefined;},{once:true});}catch{}}
}
