import type {ChaseSnapshot,Entity,ChaseEvent} from './chase.js';
const FRAME=0xd3,INPUT=0xd4,HEADER=36,ENTITY=27;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const byteAngle=(a:number)=>Math.round(((a%(Math.PI*2)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*256)%256;
const readAngle=(a:number)=>a/256*Math.PI*2;
const run=(s:ChaseSnapshot)=>s.solo?.runId??s.multi?.runId??'';
export interface WireInput {type:'input';seq:number;x:number;z:number;facing:number;held:boolean;lunge?:boolean;clientTime?:number}
export function encodeInput(m:WireInput){const b=new Uint8Array(16),v=new DataView(b.buffer);v.setUint8(0,INPUT);v.setUint32(1,m.seq,true);v.setUint32(5,(m.clientTime??Date.now())>>>0,true);v.setInt16(9,clamp(Math.round(m.x*100),-32768,32767),true);v.setInt16(11,clamp(Math.round(m.z*100),-32768,32767),true);v.setUint8(13,byteAngle(m.facing));v.setUint8(14,(m.held?1:0)|(m.lunge?2:0));return b;}
export function decodeInput(b:Uint8Array):WireInput {if(b.length!==16||b[0]!==INPUT||b[15]!==0||b[14]>3)throw new Error('Invalid input frame');const v=new DataView(b.buffer,b.byteOffset,b.byteLength);return {type:'input',seq:v.getUint32(1,true),clientTime:v.getUint32(5,true),x:v.getInt16(9,true)/100,z:v.getInt16(11,true)/100,facing:readAngle(v.getUint8(13)),held:!!(b[14]&1),lunge:!!(b[14]&2)};}
function metadata(s:ChaseSnapshot):ChaseSnapshot {
  return {...s,now:0,elapsed:0,firstCatch:null,gooseBoost:1,events:[],pickups:[],lamps:[],entities:s.entities.map(e=>({id:e.id,name:e.name,personality:e.personality} as Entity)),
    solo:s.solo?{...s.solo,intensity:0}:undefined,multi:s.multi?{...s.multi,serverTime:0,scores:s.multi.scores.map(p=>({...p,round:0}))}:undefined};
}
export type WireMessage={type:'world';snapshot:ChaseSnapshot}|{type:'events';events:ChaseEvent[]};
/** Metadata changes are reliable JSON; changing state is binary. No state belongs to a socket globally. */
export class SnapshotEncoder {
  private key='';private runId='';private lastEvent=0;
  encode(s:ChaseSnapshot):{messages:WireMessage[];frame:Uint8Array}{
    if(s.entities.length>64||s.pickups.length>8||(s.lamps?.length??0)>8)throw new Error('World exceeds wire limits');
    const messages:WireMessage[]=[],meta=metadata(s),key=JSON.stringify(meta),runId=run(s);
    if(runId!==this.runId){this.lastEvent=0;this.runId=runId;}
    if(key!==this.key){messages.push({type:'world',snapshot:meta});this.key=key;}
    const events=s.events.filter(e=>e.id>this.lastEvent);if(events.length){messages.push({type:'events',events});this.lastEvent=events.at(-1)!.id;}
    const lamps=s.lamps??[],b=new Uint8Array(HEADER+s.entities.length*ENTITY+s.pickups.length*8+lamps.length*11),v=new DataView(b.buffer);
    v.setUint8(0,FRAME);v.setUint8(1,1);v.setUint8(2,s.entities.length);v.setUint8(3,s.pickups.length);v.setUint8(4,lamps.length);
    v.setFloat64(5,s.now,true);v.setFloat32(13,s.elapsed,true);v.setFloat32(17,s.firstCatch??-1,true);v.setFloat64(21,s.multi?.serverTime??Date.now(),true);v.setUint16(29,Math.round((s.gooseBoost??1)*1000),true);v.setFloat32(31,s.solo?.intensity??0,true);
    let o=HEADER;const remaining=(time:number)=>clamp(Math.round((time-s.now)*1000),0,65535);
    for(let i=0;i<s.entities.length;i++){const e=s.entities[i];v.setUint8(o,i);v.setInt16(o+1,Math.round(e.x*100),true);v.setInt16(o+3,Math.round(e.z*100),true);v.setUint8(o+5,byteAngle(e.facing));v.setUint8(o+6,(e.role==='goose'?1:0)|(e.bot?2:0)|(e.light?4:0)|(e.held?8:0)|(e.lungeHit?16:0));v.setUint8(o+7,clamp(Math.ceil(e.battery),0,100));
      v.setUint8(o+8,byteAngle(e.aim));v.setFloat32(o+9,e.score,true);v.setInt16(o+13,clamp(Math.round(e.vx*100),-32768,32767),true);v.setInt16(o+15,clamp(Math.round(e.vz*100),-32768,32767),true);v.setUint16(o+17,remaining(e.frozenUntil),true);v.setUint16(o+19,remaining(e.immuneUntil),true);v.setUint16(o+21,remaining(e.safeUntil),true);v.setInt16(o+23,clamp(Math.round((e.lungeAt-s.now)*1000),-32768,32767),true);v.setUint8(o+25,byteAngle(e.lungeAngle));o+=ENTITY;
    }
    for(const p of s.pickups){v.setInt16(o,Math.round(p.x*100),true);v.setInt16(o+2,Math.round(p.z*100),true);v.setFloat32(o+4,p.readyAt,true);o+=8;}
    for(const p of lamps){v.setInt16(o,Math.round(p.x*100),true);v.setInt16(o+2,Math.round(p.z*100),true);v.setUint16(o+4,Math.round(p.remaining*1000),true);v.setFloat32(o+6,p.readyAt,true);v.setUint8(o+10,p.active?1:0);o+=11;}
    return {messages,frame:b};
  }
}
export class SnapshotDecoder {
  private base?:ChaseSnapshot;private events:ChaseEvent[]=[];
  reset(s:ChaseSnapshot){this.base=s;this.events=[...s.events];}
  accept(m:WireMessage){if(m.type==='world'){if(!this.base||run(this.base)!==run(m.snapshot))this.events=[];this.base=m.snapshot;}else {let last=this.events.at(-1)?.id??0;for(const e of m.events)if(e.id>last){this.events.push(e);last=e.id;}if(this.events.length>48)this.events.splice(0,this.events.length-48);}}
  decode(b:Uint8Array):ChaseSnapshot {
    if(!this.base||b.length<HEADER||b[0]!==FRAME||b[1]!==1||b[2]!==this.base.entities.length||b[2]>64||b[3]>8||b[4]>8||b.length!==HEADER+b[2]*ENTITY+b[3]*8+b[4]*11)throw new Error('Invalid snapshot frame');
    const v=new DataView(b.buffer,b.byteOffset,b.byteLength),now=v.getFloat64(5,true),entities:Entity[]=[];let o=HEADER;
    const deadline=(offset:number)=>{const ms=v.getUint16(offset,true);return ms?now+ms/1000:0;};
    for(let i=0;i<b[2];i++){if(b[o]!==i)throw new Error('Invalid entity slot');const flags=b[o+6],meta=this.base.entities[i];entities.push({...meta,x:v.getInt16(o+1,true)/100,z:v.getInt16(o+3,true)/100,facing:readAngle(b[o+5]),role:flags&1?'goose':'kid',bot:!!(flags&2),light:!!(flags&4),held:!!(flags&8),lungeHit:!!(flags&16),battery:b[o+7],aim:readAngle(b[o+8]),score:v.getFloat32(o+9,true),vx:v.getInt16(o+13,true)/100,vz:v.getInt16(o+15,true)/100,frozenUntil:deadline(o+17),immuneUntil:deadline(o+19),safeUntil:deadline(o+21),lungeAt:now+v.getInt16(o+23,true)/1000,lungeAngle:readAngle(b[o+25]),lastLight:now,dwell:{},touch:{}});o+=ENTITY;}
    const pickups:ChaseSnapshot['pickups']=[],lamps:NonNullable<ChaseSnapshot['lamps']>=[];
    for(let i=0;i<b[3];i++){pickups.push({x:v.getInt16(o,true)/100,z:v.getInt16(o+2,true)/100,readyAt:v.getFloat32(o+4,true)});o+=8;}
    for(let i=0;i<b[4];i++){lamps.push({x:v.getInt16(o,true)/100,z:v.getInt16(o+2,true)/100,remaining:v.getUint16(o+4,true)/1000,readyAt:v.getFloat32(o+6,true),active:!!b[o+10]});o+=11;}
    const first=v.getFloat32(17,true),s:ChaseSnapshot={...this.base,now,elapsed:v.getFloat32(13,true),firstCatch:first<0?null:first,entities,pickups,lamps,events:[...this.events],gooseBoost:v.getUint16(29,true)/1000};
    if(s.solo)s.solo={...s.solo,intensity:v.getFloat32(31,true)};
    if(s.multi)s.multi={...s.multi,serverTime:v.getFloat64(21,true),scores:s.multi.scores.map(p=>({...p,round:entities.find(e=>e.id===p.id)?.score??0}))};
    return s;
  }
}
