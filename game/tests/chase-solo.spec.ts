import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';
import {distance} from '../shared/chase';
import {captureFrame} from './chase-capture';
const evidence=process.env.DDG_EVIDENCE_DIR??'test-results/solo-evidence';

test('solo starts chasing by5s, teaches a freeze by10s and repeatedly retries by3s',async({browser})=>{
  test.setTimeout(60000);await mkdir(evidence,{recursive:true});const measurements=[];
  for(const viewport of [{width:667,height:375},{width:1366,height:768}]){
    let firstChasedAt=0,firstFreezeAt=0;const snapshots:any[]=[];
    const context=await browser.newContext({viewport}),page=await context.newPage(),state=watchChase(page,s=>{
      // Timestamp the same authoritative predicate at its first receipt, rather
      // than adding locator/keyboard/poll-return delays to the actual event.
      if(!firstChasedAt&&s.entities.some(e=>e.role==='goose'&&Math.hypot(e.vx,e.vz)>0))firstChasedAt=Date.now();
      if(!firstFreezeAt&&s.events.some(e=>e.type==='freeze'))firstFreezeAt=Date.now();
      snapshots.push({wall:Date.now(),now:s.now,phase:s.phase,entities:s.entities.map(e=>({id:e.id,role:e.role,x:e.x,z:e.z,held:e.held,light:e.light,aim:e.aim,battery:e.battery,frozenUntil:e.frozenUntil}))});if(snapshots.length>120)snapshots.shift();
    });
    await page.addInitScript(()=>{const log:any[]=[];(window as any).__inputLog=log;let frames=0;const frame=()=>{(window as any).__testFrames=++frames;requestAnimationFrame(frame);};requestAnimationFrame(frame);for(const type of ['keydown','keyup','pointerdown','pointerup','click','blur','focus','visibilitychange'])window.addEventListener(type,e=>{log.push({type,code:(e as KeyboardEvent).code,repeat:(e as KeyboardEvent).repeat,target:(e.target as HTMLElement)?.tagName,id:(e.target as HTMLElement)?.id,at:performance.now(),hidden:document.hidden});if(log.length>30)log.shift();});});
    await page.goto('/');await page.evaluate(()=>document.fonts.ready);await expect(page.locator('canvas')).toHaveAttribute('aria-busy','false');await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await captureFrame(page,`${evidence}/title-${viewport.width}.png`);
    const play=page.getByRole('button',{name:'Play',exact:true});await expect(play).toBeEnabled();const playBox=await play.boundingBox();expect(playBox).toBeTruthy();
    // As with retry below, measure a real tap without locator stability waits.
    const started=Date.now();await page.mouse.click(playBox!.x+playBox!.width/2,playBox!.y+playBox!.height/2);try{await expect(page.locator('#hud')).toBeVisible();}catch(error){console.log(JSON.stringify({viewport,requests:state.requests,errors:state.errors,events:await page.evaluate(()=>(window as any).__inputLog)}));throw error;}
    await page.keyboard.down('KeyA');await page.waitForTimeout(250);await page.keyboard.up('KeyA');
    await expect.poll(()=>state.snapshot?.entities.some(e=>e.role==='goose'&&Math.hypot(e.vx,e.vz)>0)??false,{timeout:5000}).toBe(true);const chasePollReturned=Date.now(),chased=firstChasedAt-started;expect(firstChasedAt).toBeGreaterThan(started);expect(chased).toBeLessThan(5000);
    await expect.poll(()=>{const s=state.snapshot,k=s?.entities.find(e=>e.id===state.id),g=s?.entities.find(e=>e.role==='goose');return k&&g?distance(k,g):100;},{timeout:3000}).toBeLessThan(8.8);
    await page.keyboard.down('Space');try{await expect.poll(()=>state.snapshot?.events.some(e=>e.type==='freeze'&&e.actor===state.id)??false,{timeout:2500}).toBe(true);}catch(error){await writeFile(`${evidence}/timing-failure-${viewport.width}.json`,JSON.stringify({started,firstChasedAt,firstFreezeAt,lastInput:state.lastInput,snapshots,page:await page.evaluate(()=>({log:(window as any).__inputLog,active:document.activeElement?.id,hidden:document.hidden}))},null,2));throw error;}const freeze=firstFreezeAt-started;expect(firstFreezeAt).toBeGreaterThan(started);expect(freeze).toBeLessThan(10000);
    await page.keyboard.up('Space');
    const before=state.snapshot!.entities.find(e=>e.id===state.id)!;
    await page.keyboard.down('KeyA');await page.waitForTimeout(600);await page.keyboard.up('KeyA');const after=state.snapshot!.entities.find(e=>e.id===state.id)!;
    if(distance(before,after)<=1.5)console.log(JSON.stringify({viewport:viewport.width,before,after,lastInput:state.lastInput,receiveAge:Date.now()-state.receivedAt,diagnostics:await page.evaluate(()=>({input:(window as any).__inputLog,frames:(window as any).__testFrames,active:document.activeElement?.id,hidden:document.hidden})),errors:state.errors}));
    expect(distance(before,after)).toBeGreaterThan(1.5);
    const retries=[],actionBox=await page.locator('#action').boundingBox();expect(actionBox).toBeTruthy();
    for(let run=0;run<2;run++){
      await expect.poll(()=>state.snapshot?.phase,{timeout:15000,intervals:[50,100]}).toBe('results');const oldRun=state.snapshot!.solo!.runId,caught=state.runTimes[oldRun].results!;
      await expect(page.locator('#action-label')).toHaveText('AGAIN');
      // The persistent button has a fixed measured position. Send a real pointer tap
      // without locator.click's RAF-based stability waits extending the reaction time.
      await page.mouse.click(actionBox!.x+actionBox!.width/2,actionBox!.y+actionBox!.height/2);await expect.poll(()=>state.snapshot?.solo?.runId,{timeout:3000,intervals:[50,100]}).not.toBe(oldRun);const retry=state.runTimes[state.snapshot!.solo!.runId].playing!-caught;if(retry>=3000)console.log(JSON.stringify({retry,run,caught,retrySentAt:state.retrySentAt,retryQueuedAt:state.retryQueuedAt,lastInput:state.lastInput}));expect(retry).toBeLessThan(3000);retries.push(retry);
      await expect(page.locator('#results')).toBeHidden();await expect(page.locator('#action')).toContainText('LIGHT');
    }
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ddg-best')??'{}'));expect(saved.runs).toBe(2);expect(saved.time).toBeGreaterThan(4);expect(saved.score).toBeGreaterThan(0);
    expect(state.errors).toEqual([]);measurements.push({viewport,chasedMs:chased,freezeMs:freeze,retryMs:retries,best:saved.time,corrections:state.corrections,timingMethod:'first received authoritative state',chasePollReturnMs:chasePollReturned-started});
    await page.reload();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#best')).toContainText('BEST');
    const sizes=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));expect(sizes.sw).toBe(sizes.w);expect(sizes.sh).toBe(sizes.h);
    await context.close();
  }
  await writeFile(`${evidence}/timings.json`,JSON.stringify(measurements,null,2));
});

test('solo evidence shows chase, freeze, conversion and result at both sizes',async({browser})=>{
  test.setTimeout(45000);await mkdir(evidence,{recursive:true});
  for(const viewport of [{width:667,height:375},{width:1366,height:768}]){
    const context=await browser.newContext({viewport}),page=await context.newPage(),state=watchChase(page);await page.goto('/');await page.getByRole('button',{name:'Play',exact:true}).click();
    await expect.poll(()=>{const s=state.snapshot,k=s?.entities.find(e=>e.id===state.id),g=s?.entities.find(e=>e.role==='goose');return s&&k&&g&&s.elapsed>3.5&&distance(k,g)<7.8;}).toBe(true);const run=state.snapshot!.solo!.runId;
    // Start a compositor capture, but do not delay the player's defence until
    // the GPU has encoded/read back the PNG. Input continues during capture.
    const captured=captureFrame(page,`${evidence}/chase-${viewport.width}.png`);await page.keyboard.down('Space');await captured;expect(state.snapshot!.solo!.runId).toBe(run);expect(state.snapshot!.phase).toBe('playing');
    await expect.poll(()=>state.snapshot?.events.some(e=>e.type==='freeze'&&e.actor===state.id)??false).toBe(true);await captureFrame(page,`${evidence}/freeze-${viewport.width}.png`);await page.keyboard.up('Space');expect(state.snapshot!.solo!.runId).toBe(run);
    await expect.poll(()=>state.snapshot?.phase,{timeout:15000,intervals:[25,50]}).toBe('results');await captureFrame(page,`${evidence}/catch-${viewport.width}.png`);await expect(page.locator('#results')).toBeVisible();await captureFrame(page,`${evidence}/results-${viewport.width}.png`);expect(state.snapshot!.solo!.runId).toBe(run);
    const bounds=await page.locator('#hud').evaluate(hud=>Array.from(hud.querySelectorAll('b,span')).map(e=>({text:e.textContent,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,scroll:e.scrollWidth,width:e.clientWidth})));
    for(const box of bounds){if(!box.width)continue;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(viewport.width);expect(box.scroll).toBeLessThanOrEqual(box.width);}
    expect(state.errors).toEqual([]);await context.close();
  }
});
