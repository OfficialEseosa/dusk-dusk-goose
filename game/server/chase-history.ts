import type {Point} from '../shared/chase.js';
/** At most eleven50ms samples per entity, never farther back than half a second. */
export class PositionHistory {
  private samples=new Map<string,{at:number;x:number;z:number}[]>();
  record(id:string,at:number,p:Point){let rows=this.samples.get(id);if(!rows){rows=[];this.samples.set(id,rows);}if(rows.at(-1)?.at===at)rows.pop();rows.push({at,x:p.x,z:p.z});while(rows.length>11||rows.length>1&&rows[0].at<at-.5-1e-9)rows.shift();}
  at(id:string,time:number,fallback:Point):Point {const rows=this.samples.get(id);if(!rows?.length)return fallback;if(time<rows[0].at)return rows[0];
    for(let i=1;i<rows.length;i++)if(rows[i].at>=time){const a=rows[i-1],b=rows[i],t=(time-a.at)/(b.at-a.at||1);return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};}return rows.at(-1)!;}
  count(id:string){return this.samples.get(id)?.length??0;}
}
export function segmentDistance(p:Point,a:Point,b:Point){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);}
