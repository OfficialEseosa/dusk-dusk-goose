/** Display conveniences never replace gameplay controls or require fullscreen. */
export class PlayComfort {
 private button?:HTMLButtonElement;
 private tip?:HTMLElement;
 constructor(private container:HTMLElement){
  const controls=container.querySelector('.display-controls')!;
  if(document.fullscreenEnabled&&typeof document.documentElement.requestFullscreen==='function'){
   this.button=document.createElement('button');this.button.id='fullscreen';this.button.textContent='Fullscreen';
   controls.prepend(this.button);this.button.addEventListener('click',this.toggle);
   document.addEventListener('fullscreenchange',this.changed);
  }else{
   let dismissed=false;try{dismissed=localStorage.getItem('maple:install-tip:v1')==='dismissed';}catch{}
   if(!dismissed){
    this.tip=document.createElement('aside');this.tip.id='install-tip';this.tip.innerHTML='<span>For the best experience, tap Share, then Add to Home Screen.</span><button id="dismiss-install-tip" aria-label="Dismiss home screen tip">Close</button>';container.append(this.tip);
    this.tip.querySelector('button')!.addEventListener('click',()=>{try{localStorage.setItem('maple:install-tip:v1','dismissed');}catch{}this.tip?.remove();});
   }
  }
  const hint=document.createElement('p');hint.id='orientation-hint';hint.textContent='Turn your phone sideways for more room.';hint.setAttribute('role','status');container.append(hint);
 }
 private toggle=async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{if(this.button){this.button.textContent='Try fullscreen';this.button.setAttribute('aria-label','Try fullscreen again');}}
 };
 private changed=()=>{if(this.button){this.button.textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';this.button.removeAttribute('aria-label');}};
 dispose(){document.removeEventListener('fullscreenchange',this.changed);}
}
