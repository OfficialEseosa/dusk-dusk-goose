import type {Page} from '@playwright/test';
import type {ChaseSnapshot} from '../shared/chase';
import {SnapshotDecoder,decodeInput} from '../shared/chase-wire';
export function watchChase(page:Page,onSnapshot?:(snapshot:ChaseSnapshot)=>void){
  const state:{snapshot?:ChaseSnapshot;id?:string;receivedAt:number;corrections:number;errors:string[];lastInput?:any;retrySentAt?:number;retryQueuedAt?:number;requests:{type:string;at:number}[];runTimes:Record<string,{playing?:number;results?:number}>}={receivedAt:0,corrections:0,errors:[],requests:[],runTimes:{}};
  page.on('pageerror',e=>state.errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&/THREE\.WebGLProgram|VALIDATE_STATUS|Shader Error|WebGL.*INVALID/i.test(message.text()))state.errors.push(message.text());});
  page.on('websocket',socket=>{const decoder=new SnapshotDecoder();socket.on('framesent',frame=>{try{const m=typeof frame.payload==='string'?JSON.parse(frame.payload):decodeInput(frame.payload);if(m.type!=='input'){state.requests.push({type:m.type,at:Date.now()});if(state.requests.length>30)state.requests.shift();}if(m.type==='input')state.lastInput={...m,at:Date.now()};if(m.type==='retry')state.retrySentAt=Date.now();}catch{}});socket.on('framereceived',frame=>{
    let m:any;try{m=typeof frame.payload==='string'?JSON.parse(frame.payload):{type:'snapshot',snapshot:decoder.decode(frame.payload)};if(m.type==='world'||m.type==='events'){decoder.accept(m);return;}if(m.type==='seat')decoder.reset(m.snapshot);}catch(error){state.errors.push(`Invalid network frame: ${String(error)}`);return;}
    if(m.type==='seat'){state.id=m.id;state.snapshot=m.snapshot;state.receivedAt=Date.now();}
    if(m.type==='snapshot'){state.snapshot=m.snapshot;state.receivedAt=Date.now();}
    if(m.type==='seat'||m.type==='snapshot')onSnapshot?.(m.snapshot);
    if((m.type==='seat'||m.type==='snapshot')&&m.snapshot.solo){const s=m.snapshot as ChaseSnapshot,times=state.runTimes[s.solo!.runId]??={};times[s.phase]??=Date.now();}
    if(m.type==='correction')state.corrections++;
    if(m.type==='retryQueued')state.retryQueuedAt=Date.now();
  });});
  return state;
}
