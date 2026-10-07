export interface SoloBest {time:number;score:number;runs:number;lastResult:string}
const KEY='ddg-best';
export function readBest(storage?:Pick<Storage,'getItem'>):SoloBest {
  try {const v=JSON.parse((storage??localStorage).getItem(KEY)??'{}');const number=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:0;return {time:number(v.time),score:number(v.score),runs:Math.floor(number(v.runs)),lastResult:typeof v.lastResult==='string'?v.lastResult:''};}
  catch{return {time:0,score:0,runs:0,lastResult:''};}
}
export function saveBest(best:SoloBest,storage?:Pick<Storage,'setItem'>){try{(storage??localStorage).setItem(KEY,JSON.stringify(best));}catch{/* Private browsing must never prevent a chase. */}}
export function recordRun(best:SoloBest,runId:string,time:number,score:number){
  if(best.lastResult===runId)return best;
  return {time:Math.max(best.time,time),score:Math.max(best.score,score),runs:best.runs+1,lastResult:runId};
}
export function torchReward(time:number){
  if(time<30)return {goal:'Survive 0:30 to unlock the amber torch.',color:'#ffe2a8'};
  if(time<60)return {goal:'Amber torch unlocked. Reach 1:00 for the rose torch.',color:'#ffc873'};
  if(time<120)return {goal:'Rose torch unlocked. Reach 2:00 for the violet torch.',color:'#ffb3bd'};
  return {goal:'Violet torch unlocked. How long can you hold back the flock?',color:'#d6b4ff'};
}
export function formatTime(seconds:number){return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;}
