import type {Entity,Point} from '../shared/chase';
export class ServerClock {
  private samples:{rtt:number;offset:number}[]=[];private offset=0;private from=0;private changed=0;private initialized=false;private last=-Infinity;
  sample(sent:number,received:number,server:number){const rtt=Math.max(0,received-sent);this.samples.push({rtt,offset:server+(rtt/2)-received});if(this.samples.length>8)this.samples.shift();
    const best=this.samples.reduce((a,b)=>a.rtt<=b.rtt?a:b);this.from=this.currentOffset(received);this.offset=best.offset;this.changed=received;if(!this.initialized){this.from=this.offset;this.initialized=true;}}
  private currentOffset(local:number){const t=Math.min(1,Math.max(0,(local-this.changed)/500));return this.from+(this.offset-this.from)*t;}
  now(local:number){return this.last=Math.max(this.last,local+this.currentOffset(local));}
  get ready(){return this.initialized;}
}
/** Remote positions interpolate100ms behind the latest frame; local movement stays immediate. */
export class RemotePositions {
  private rows=new Map<string,{at:number;x:number;z:number;role:string}[]>();
  clear(){this.rows.clear();}
  receive(at:number,entities:Entity[]){const active=new Set(entities.map(e=>e.id));for(const id of this.rows.keys())if(!active.has(id))this.rows.delete(id);
    for(const e of entities){let rows=this.rows.get(e.id);if(!rows||rows.at(-1)?.role!==e.role){rows=[];this.rows.set(e.id,rows);}rows.push({at,x:e.x,z:e.z,role:e.role});while(rows.length>12||rows.length>1&&rows[0].at<at-.6)rows.shift();}}
  at(id:string,time:number,fallback:Point):Point {const rows=this.rows.get(id);if(!rows?.length)return fallback;if(time<=rows[0].at)return rows[0];
    for(let i=1;i<rows.length;i++)if(rows[i].at>=time){const a=rows[i-1],b=rows[i],t=(time-a.at)/(b.at-a.at||1);return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};}return rows.at(-1)!;}
}
