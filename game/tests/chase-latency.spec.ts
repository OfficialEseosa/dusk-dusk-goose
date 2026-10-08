import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';
import {latencyRelay} from './chase-relay';
import {distance,clearPath} from '../shared/chase';
const evidence=process.env.DDG_NETWORK_EVIDENCE_DIR??'test-results/network-evidence';
for(const delay of [100,200])test(`human beam, lunge, infection and converted chase with${delay}ms each way`,async({browser,baseURL})=>{
  test.setTimeout(80000);const relay=await latencyRelay(Number(new URL(baseURL!).port),delay),a=await browser.newContext({viewport:{width:667,height:375}}),b=await browser.newContext({viewport:{width:1366,height:768}});
  const p=await a.newPage(),q=await b.newPage(),one=watchChase(p),two=watchChase(q);
  for(const page of [p,q])await page.addInitScript(()=>{const log:any[]=[];(window as any).__inputLog=log;let frames=0;const frame=()=>{(window as any).__testFrames=++frames;requestAnimationFrame(frame);};requestAnimationFrame(frame);for(const type of ['keydown','keyup','blur','focus','visibilitychange'])window.addEventListener(type,e=>{log.push({type,code:(e as KeyboardEvent).code,at:performance.now(),hidden:document.hidden});if(log.length>30)log.shift();});});
  const me=(state:typeof one)=>state.snapshot!.entities.find(e=>e.id===state.id)!;
  async function axis(page:Page,state:typeof one,axis:'x'|'z',target:number){
    await page.bringToFront();await page.locator('canvas').click();await expect.poll(()=>page.evaluate(()=>document.hasFocus())).toBe(true);await page.waitForTimeout(100);
    const trace=[];
    // Stop at the asserted precision: a 20Hz movement tick is about .275m.
    // Trying to refine an already valid position can oscillate across the target.
    for(let attempt=0;attempt<4;attempt++){const e=me(state),delta=target-e[axis];if(Math.abs(delta)<.3)return;
      const key=axis==='x'?delta>0?'KeyD':'KeyA':delta>0?'KeyS':'KeyW',speed=5.5*(state.snapshot!.gooseBoost??1);
      const corrections=state.corrections;await page.keyboard.down(key);await page.waitForTimeout(Math.min(3000,Math.abs(delta)/speed*1000));await page.keyboard.up(key);await page.waitForTimeout(delay*2+180);
      trace.push({delay,axis,target,attempt,from:e[axis],to:me(state)[axis],corrections:state.corrections-corrections,lastInput:state.lastInput,now:state.snapshot!.now});
    }if(Math.abs(target-me(state)[axis])>=.3)console.log(JSON.stringify({trace,input:await page.evaluate(()=>({log:(window as any).__inputLog,frames:(window as any).__testFrames,focus:document.hasFocus(),active:document.activeElement?.tagName}))}));expect(Math.abs(target-me(state)[axis])).toBeLessThan(.3);
  }
  try{
    await p.goto(relay.url);await p.getByRole('textbox',{name:'Your name'}).fill('Alex');await p.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>one.snapshot?.code).toBeTruthy();
    await q.goto(relay.url);await q.getByRole('textbox',{name:'Your name'}).fill('Riley');await q.getByRole('textbox',{name:'Room code'}).fill(one.snapshot!.code);await q.getByRole('button',{name:'Join friends'}).click();
    await expect.poll(()=>one.snapshot?.multi?.stage,{timeout:12000}).toBe('playing');await expect.poll(()=>two.snapshot?.multi?.stage).toBe('playing');
    const first=one.snapshot!.multi!.startingGeese[0],goose=first===one.id?p:q,kid=first===one.id?q:p,gs=first===one.id?one:two,ks=first===one.id?two:one,run=one.snapshot!.multi!.runId;
    await expect.poll(()=>gs.snapshot!.now-me(gs).safeUntil).toBeGreaterThan(0);
    await axis(goose,gs,'z',7.3);await axis(goose,gs,'x',2);
    await expect.poll(()=>distance(me(gs),me(ks))).toBeLessThan(7);
    await kid.bringToFront();await kid.locator('canvas').focus();const lit=Date.now();await kid.keyboard.down('Space');await expect.poll(()=>ks.snapshot!.events.some(e=>e.type==='freeze'&&e.actor===ks.id&&e.target===gs.id),{timeout:4000}).toBe(true);await kid.keyboard.up('Space');const freezeMs=Date.now()-lit;
    await expect.poll(()=>gs.snapshot!.now-me(gs).frozenUntil,{timeout:3000}).toBeGreaterThan(0);
    await axis(goose,gs,'x',me(ks).x+1.6);const lunged=Date.now();await goose.keyboard.press('Space');
    await expect.poll(()=>me(ks).role,{timeout:4000}).toBe('goose');expect(ks.snapshot!.events.some(e=>e.type==='catch'&&e.actor===gs.id&&e.target===ks.id)).toBe(true);const catchMs=Date.now()-lunged;
    await expect(kid.locator('#action')).toContainText('LUNGE');await expect.poll(()=>ks.snapshot!.now-me(ks).safeUntil,{timeout:3500}).toBeGreaterThan(0);
    const before={...me(ks)},direction=[{key:'KeyD',x:1,z:0},{key:'KeyA',x:-1,z:0},{key:'KeyW',x:0,z:-1}].find(d=>clearPath(before,{x:before.x+d.x*2,z:before.z+d.z*2}))!;expect(direction).toBeTruthy();
    await kid.bringToFront();await kid.locator('canvas').focus();await kid.keyboard.down(direction.key);await kid.waitForTimeout(300);await kid.keyboard.up(direction.key);await kid.waitForTimeout(delay*2+180);const moved=distance(before,me(ks));expect(moved).toBeGreaterThan(.5);
    await kid.keyboard.press('Space');await expect.poll(()=>ks.snapshot!.events.some(e=>e.type==='windup'&&e.actor===ks.id),{timeout:2500}).toBe(true);
    expect(ks.snapshot!.multi!.runId).toBe(run);expect([...one.errors,...two.errors]).toEqual([]);
    await mkdir(evidence,{recursive:true});await writeFile(`${evidence}/latency-${delay}.json`,JSON.stringify({delayEachWay:delay,freezeMs,catchMs,corrections:[one.corrections,two.corrections],convertedMovement:moved,errors:[...one.errors,...two.errors]},null,2));
  }finally{await a.close();await b.close();await relay.close();}
});
