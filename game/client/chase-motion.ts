import {slide,type Point,type Arena,PARK} from '../shared/chase';
/** Device movement uses the input clock, never the GPU clock. Long suspensions cannot jump. */
export function advanceMotion(position:Point,direction:Point,speed:number,elapsed:number,arena:Arena=PARK){
  const length=Math.hypot(direction.x,direction.z),scale=Math.min(1,length)/(length||1),dt=Math.max(0,Math.min(.15,elapsed));
  return slide(position,direction.x*scale*speed*dt,direction.z*scale*speed*dt,arena);
}
