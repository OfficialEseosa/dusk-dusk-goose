import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';
import {distance} from '../shared/chase';

test('solo starts chasing by5s, teaches a freeze by10s and repeatedly retries by3s',async({browser})=>{
  test.setTimeout(60000);await mkdir('evidence/phase2',{recursive:true});const measurements=[];
  for(const viewport of [{width:667,height:375},{width:1366,height:768}]){
    const context=await browser.newContext({viewport}),page=await context.newPage(),state=watchChase(page);
    await page.addInitScript(()=>{const log:any[]=[];(window as any).__inputLog=log;let frames=0;const frame=()=>{(window as any).__testFrames=++frames;requestAnimationFrame(frame);};requestAnimationFrame(frame);for(const type of ['keydown','keyup','blur','focus','visibilitychange'])window.addEventListener(type,e=>{log.push({type,code:(e as KeyboardEvent).code,target:(e.target as HTMLElement)?.tagName,at:performance.now(),hidden:document.hidden});if(log.length>30)log.shift();});});
    await page.goto('/');await page.screenshot({path:`evidence/phase2/title-${viewport.width}.png`});
    const started=Date.now();await page.getByRole('button',{name:'Play',exact:true}).click();await expect(page.locator('#hud')).toBeVisible();
    await page.keyboard.down('KeyA');await page.waitForTimeout(250);await page.keyboard.up('KeyA');
    await expect.poll(()=>state.snapshot?.entities.some(e=>e.role==='goose'&&Math.hypot(e.vx,e.vz)>0)??false,{timeout:5000}).toBe(true);const chased=Date.now()-started;expect(chased).toBeLessThan(5000);
    await expect.poll(()=>{const s=state.snapshot,k=s?.entities.find(e=>e.id===state.id),g=s?.entities.find(e=>e.role==='goose');return k&&g?distance(k,g):100;},{timeout:3000}).toBeLessThan(8.8);
    await page.keyboard.down('Space');await expect.poll(()=>state.snapshot?.events.some(e=>e.type==='freeze'&&e.actor===state.id)??false,{timeout:2500}).toBe(true);const freeze=Date.now()-started;expect(freeze).toBeLessThan(10000);
    await page.keyboard.up('Space');
    const before=state.snapshot!.entities.find(e=>e.id===state.id)!;
    await page.keyboard.down('KeyA');await page.waitForTimeout(600);await page.keyboard.up('KeyA');const after=state.snapshot!.entities.find(e=>e.id===state.id)!;
    if(distance(before,after)<=1.5)console.log(JSON.stringify({viewport:viewport.width,before,after,lastInput:state.lastInput,receiveAge:Date.now()-state.receivedAt,diagnostics:await page.evaluate(()=>({input:(window as any).__inputLog,frames:(window as any).__testFrames,active:document.activeElement?.id,hidden:document.hidden})),errors:state.errors}));
    expect(distance(before,after)).toBeGreaterThan(1.5);
    const retries=[];
    for(let run=0;run<2;run++){
      await expect.poll(()=>state.snapshot?.phase,{timeout:15000,intervals:[50,100]}).toBe('results');const oldRun=state.snapshot!.solo!.runId,caught=state.runTimes[oldRun].results!;
      await expect(page.locator('#action-label')).toHaveText('AGAIN');await page.locator('#action').click();await expect.poll(()=>state.snapshot?.solo?.runId,{timeout:3000,intervals:[50,100]}).not.toBe(oldRun);const retry=state.runTimes[state.snapshot!.solo!.runId].playing!-caught;if(retry>=3000)console.log(JSON.stringify({retry,run,caught,retrySentAt:state.retrySentAt,retryQueuedAt:state.retryQueuedAt,lastInput:state.lastInput}));expect(retry).toBeLessThan(3000);retries.push(retry);
      await expect(page.locator('#results')).toBeHidden();await expect(page.locator('#action')).toContainText('LIGHT');
    }
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ddg-best')??'{}'));expect(saved.runs).toBe(2);expect(saved.time).toBeGreaterThan(4);expect(saved.score).toBeGreaterThan(0);
    expect(state.errors).toEqual([]);measurements.push({viewport,chasedMs:chased,freezeMs:freeze,retryMs:retries,best:saved.time,corrections:state.corrections});
    await page.reload();await expect(page.locator('#hud')).toBeVisible();await expect(page.locator('#best')).toContainText('BEST');
    const sizes=await page.evaluate(()=>({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}));expect(sizes.sw).toBe(sizes.w);expect(sizes.sh).toBe(sizes.h);
    await context.close();
  }
  await writeFile('evidence/phase2/timings.json',JSON.stringify(measurements,null,2));
});

test('solo evidence shows chase, freeze, conversion and result at both sizes',async({browser})=>{
  test.setTimeout(45000);await mkdir('evidence/phase2',{recursive:true});
  for(const viewport of [{width:667,height:375},{width:1366,height:768}]){
    const context=await browser.newContext({viewport}),page=await context.newPage(),state=watchChase(page);await page.goto('/');await page.getByRole('button',{name:'Play',exact:true}).click();
    await expect.poll(()=>state.snapshot?.elapsed??0).toBeGreaterThan(3.5);await page.screenshot({path:`evidence/phase2/chase-${viewport.width}.png`});
    await page.keyboard.down('Space');await expect.poll(()=>state.snapshot?.events.some(e=>e.type==='freeze')??false).toBe(true);await page.screenshot({path:`evidence/phase2/freeze-${viewport.width}.png`});await page.keyboard.up('Space');
    await expect.poll(()=>state.snapshot?.phase,{timeout:15000,intervals:[25,50]}).toBe('results');await page.screenshot({path:`evidence/phase2/catch-${viewport.width}.png`});await expect(page.locator('#results')).toBeVisible();await page.screenshot({path:`evidence/phase2/results-${viewport.width}.png`});
    const bounds=await page.locator('#hud').evaluate(hud=>Array.from(hud.querySelectorAll('b,span')).map(e=>({text:e.textContent,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,scroll:e.scrollWidth,width:e.clientWidth})));
    for(const box of bounds){if(!box.width)continue;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(viewport.width);expect(box.scroll).toBeLessThanOrEqual(box.width);}
    expect(state.errors).toEqual([]);await context.close();
  }
});
