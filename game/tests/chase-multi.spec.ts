import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';
const evidence=process.env.DDG_NETWORK_EVIDENCE_DIR??'test-results/network-evidence';
for(const viewport of [{width:667,height:375},{width:1366,height:768}])test(`multiplayer infection, hidden bot cover, dawn and rotated rematch at${viewport.width}`,async({browser})=>{
  test.setTimeout(125000);await mkdir(evidence,{recursive:true});
  const a=await browser.newContext({viewport}),b=await browser.newContext({viewport});const p=await a.newPage(),q=await b.newPage(),one=watchChase(p),two=watchChase(q);
  try{
    await p.goto('/');await p.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>one.snapshot?.code).toBeTruthy();
    await q.goto('/');await q.getByRole('textbox',{name:'Room code'}).fill(one.snapshot!.code);await q.getByRole('button',{name:'Join friends'}).click();
    await expect.poll(()=>two.snapshot?.multi?.stage).toBe('joining');await expect(q.locator('#message')).toContainText('A friend joined');
    await expect.poll(()=>one.snapshot?.multi?.stage,{timeout:10000}).toBe('playing');
    const first=one.snapshot!.multi!.startingGeese[0],run=one.snapshot!.multi!.runId;
    const goose=first===one.id?p:q,kid=first===one.id?q:p,kidState=first===one.id?two:one,gooseState=first===one.id?one:two;
    await kid.screenshot({path:`${evidence}/multiplayer-${viewport.width}.png`});
    await goose.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    await expect.poll(()=>gooseState.snapshot?.entities.find(e=>e.id===first)?.bot,{timeout:5000}).toBe(true);
    await expect.poll(()=>kidState.snapshot?.entities.find(e=>e.id===kidState.id)?.role,{timeout:55000}).toBe('goose');
    await expect(kid.locator('#action')).toContainText('LUNGE');expect(kidState.snapshot!.events.some(e=>e.type==='catch'&&e.target===kidState.id)).toBe(true);
    await goose.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    await expect.poll(()=>gooseState.snapshot?.entities.find(e=>e.id===first)?.bot).toBe(false);
    // Refresh the converted seat: private credential must preserve role and this exact round.
    const seat=kidState.id;await kid.reload();await expect.poll(()=>kidState.id).toBe(seat);await expect(kid.locator('#action')).toContainText('LUNGE');expect(kidState.snapshot!.multi!.runId).toBe(run);
    await expect.poll(()=>one.snapshot?.multi?.stage,{timeout:85000}).toBe('results');await expect.poll(()=>two.snapshot?.multi?.stage).toBe('results');
    await expect(p.locator('#results')).toBeVisible();await expect(q.locator('#results')).toBeVisible();
    expect(one.snapshot!.events.some(e=>e.type==='dawn'||e.type==='flock')).toBe(true);
    expect(one.snapshot!.multi!.scores.map(e=>Math.floor(e.total))).toEqual(two.snapshot!.multi!.scores.map(e=>Math.floor(e.total)));
    await kid.screenshot({path:`${evidence}/results-${viewport.width}.png`});
    await expect.poll(()=>one.snapshot?.multi?.round,{timeout:10000}).toBe(2);await expect.poll(()=>two.snapshot?.multi?.round).toBe(2);
    expect(one.snapshot!.multi!.startingGeese[0]).not.toBe(first);expect(one.snapshot!.multi!.runId).not.toBe(run);
    for(const page of [p,q])expect(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight)).toBe(true);
    expect([...one.errors,...two.errors]).toEqual([]);
  }finally{await a.close();await b.close();}
});
