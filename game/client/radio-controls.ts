import type {RoomSnapshot} from '../shared/protocol';
import {getRadioPhrases,RADIO_HISTORY_LIMIT,RADIO_TEXT_LIMIT} from '../shared/radio';

/** Input and buttons keep their identity through every snapshot and transmission. */
export class RadioControls {
 private room?:RoomSnapshot;
 private open=false;
 private busy=false;
 private offset=0;
 private signature='';
 private readonly toggle:HTMLButtonElement;
 private readonly panel:HTMLElement;
 private readonly input:HTMLInputElement;
 private readonly sendButton:HTMLButtonElement;
 private readonly history:HTMLElement;
 private readonly note:HTMLElement;
 private readonly phrases:HTMLButtonElement[]=[];
 private readonly rows:HTMLElement[]=[];
 private readonly transmission:HTMLElement;
 private readonly timer:ReturnType<typeof setInterval>;
 constructor(private container:HTMLElement,private playerId:string,private send:(type:string,fields:Record<string,unknown>)=>Promise<{ok:boolean;error?:{message:string}}>){
  this.toggle=document.createElement('button');this.toggle.id='radio-toggle';this.toggle.innerHTML='Radio <small>R</small>';this.toggle.setAttribute('aria-expanded','false');this.toggle.setAttribute('aria-controls','radio-panel');container.append(this.toggle);
  this.panel=document.createElement('section');this.panel.id='radio-panel';this.panel.hidden=true;this.panel.setAttribute('aria-label','Walkie-talkie');
  this.panel.innerHTML='<header><strong>Walkie-talkie</strong><button id="radio-close" aria-label="Close radio">Close</button></header><form id="radio-form"><input id="radio-input" aria-label="Radio message" placeholder="Say something" autocomplete="off" enterkeyhint="send"><button id="radio-send" type="submit">Send</button></form><div class="radio-body"><div id="radio-phrases" aria-label="Quick phrases"></div><ol id="radio-history" aria-label="Recent radio messages"></ol></div><p id="radio-note" role="status"></p>';
  container.append(this.panel);this.input=this.panel.querySelector('#radio-input')!;this.sendButton=this.panel.querySelector('#radio-send')!;this.history=this.panel.querySelector('#radio-history')!;this.note=this.panel.querySelector('#radio-note')!;
  for(let i=0;i<4;i++){const button=document.createElement('button');button.type='button';button.addEventListener('click',()=>{const phrase=getRadioPhrases(this.room!,this.playerId)[i];if(phrase)void this.submit('radio_quick',{phraseId:phrase.id});});this.panel.querySelector('#radio-phrases')!.append(button);this.phrases.push(button);}
  for(let i=0;i<RADIO_HISTORY_LIMIT;i++){const row=document.createElement('li');row.hidden=true;row.innerHTML='<strong></strong><span></span>';this.history.append(row);this.rows.push(row);}
  this.transmission=container.querySelector('#clue-transmission')!;
  this.toggle.addEventListener('click',()=>this.setOpen(!this.open));this.panel.querySelector('#radio-close')!.addEventListener('click',()=>this.setOpen(false));
  this.panel.querySelector('form')!.addEventListener('submit',event=>{event.preventDefault();void this.submit('radio',{text:this.input.value});});
  this.input.addEventListener('focus',this.viewport);this.input.addEventListener('blur',this.viewport);
  window.addEventListener('keydown',this.key);window.addEventListener('resize',this.viewport);window.visualViewport?.addEventListener('resize',this.viewport);window.visualViewport?.addEventListener('scroll',this.viewport);
  this.timer=setInterval(()=>this.tick(),100);
 }
 update(room:RoomSnapshot){this.room=room;this.offset=room.serverTime-Date.now();const phrases=getRadioPhrases(room,this.playerId);this.phrases.forEach((button,i)=>{const phrase=phrases[i];button.hidden=!phrase;if(!phrase)return;if(button.textContent!==phrase.text)button.textContent=phrase.text;button.dataset.phraseId=phrase.id;});
  const messages=room.radio??[],signature=messages.map(m=>m.id).join('|');if(signature!==this.signature){this.signature=signature;this.rows.forEach((row,i)=>{const message=messages[messages.length-1-i];row.hidden=!message;if(!message)return;row.dataset.messageId=message.id;row.dataset.kind=message.kind;row.querySelector('strong')!.textContent=`${message.kind==='clue'?'Clue · ':''}${message.senderName}`;row.querySelector('span')!.textContent=message.text;});this.history.scrollTop=0;}this.tick();}
 private setOpen(open:boolean){this.open=open;this.panel.hidden=!open;this.toggle.setAttribute('aria-expanded',String(open));this.container.classList.toggle('radio-open',open);if(!open)this.input.blur();this.viewport();}
 private async submit(type:string,fields:Record<string,unknown>){if(this.busy)return;const draft=this.input.value;if(type==='radio'&&Array.from(draft).length>RADIO_TEXT_LIMIT){this.note.textContent='Keep it to 80 characters.';return;}if(type==='radio'&&!draft.trim()){this.note.textContent='Write a message first.';return;}this.busy=true;this.sendButton.disabled=true;try{const result=await this.send(type,fields);this.note.textContent=result.ok?'Sent.':result.error?.message??'Radio is reconnecting. Try again shortly.';if(result.ok&&type==='radio'&&this.input.value===draft)this.input.value='';}finally{this.busy=false;this.sendButton.disabled=false;}}
 private key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&this.open){event.preventDefault();this.setOpen(false);return;}const editable=event.target instanceof HTMLElement&&Boolean(event.target.closest('input,textarea,[contenteditable="true"]'));if(editable)return;if(event.key.toLowerCase()==='r'&&!event.repeat){event.preventDefault();this.setOpen(!this.open);}else if(event.key==='Escape'&&this.open)this.setOpen(false);};
 private viewport=()=>{const height=window.visualViewport?.height??innerHeight;this.container.classList.toggle('radio-keyboard',this.open&&document.activeElement===this.input&&height<300);this.container.style.setProperty('--radio-viewport-height',`${height}px`);};
 private tick(){const scorePanel=this.container.querySelector<HTMLElement>('#match-panel')!,parent=this.container.classList.contains('showing-scores')?scorePanel:this.container;if(this.transmission.parentElement!==parent)parent.insertBefore(this.transmission,parent===scorePanel?scorePanel.querySelector('#match-countdown'):null);const latest=this.room?.radio?.at(-1),now=Date.now()+this.offset;this.transmission.hidden=!latest||now-latest.sentAt>15000||this.open;if(latest){const text=`${latest.kind==='clue'?'Clue · ':''}${latest.senderName}: ${latest.text}`;if(this.transmission.textContent!==text)this.transmission.textContent=text;this.transmission.dataset.kind=latest.kind;}}
 dispose(){clearInterval(this.timer);window.removeEventListener('keydown',this.key);window.removeEventListener('resize',this.viewport);window.visualViewport?.removeEventListener('resize',this.viewport);window.visualViewport?.removeEventListener('scroll',this.viewport);this.container.classList.remove('radio-open','radio-keyboard');}
}
