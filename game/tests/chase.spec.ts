import {test,expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';
test('plain chase responds at phone and laptop dimensions with independent joined sessions',async({browser})=>{
  await mkdir('test-results/chase-smoke',{recursive:true});
  for(const viewport of [{width:667,height:375},{width:1366,height:768}]){
    const a=await browser.newContext({viewport}),b=await browser.newContext({viewport});const p=await a.newPage(),q=await b.newPage();const errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
    const host=watchChase(p),guest=watchChase(q);await p.goto('/');await expect(p.getByRole('button',{name:'Play',exact:true})).toBeVisible();
    await p.screenshot({path:`test-results/chase-smoke/title-${viewport.width}.png`});await p.getByRole('button',{name:'Play',exact:true}).click();await expect(p.locator('#hud')).toBeVisible();
    const code=(await p.locator('#room').innerText()).replace('ROOM ','');
    await p.keyboard.down('KeyD');await p.waitForTimeout(600);await p.keyboard.up('KeyD');await p.keyboard.down('Space');await p.waitForTimeout(900);await p.keyboard.up('Space');
    await p.screenshot({path:`test-results/chase-smoke/chase-${viewport.width}.png`});
    await q.goto('/');await q.getByRole('textbox',{name:'Room code'}).fill(code);await q.getByRole('button',{name:'Join friends'}).click();await expect(q.locator('#room')).toHaveText(`ROOM ${code}`);
    await expect.poll(()=>guest.snapshot?.multi?.stage).toBe('joining');await expect(q.locator('#action')).toContainText('LIGHT');
    await expect.poll(()=>guest.snapshot?.multi?.stage,{timeout:6000}).toBe('countdown');
    await expect.poll(()=>host.snapshot?.multi?.runId===guest.snapshot?.multi?.runId).toBe(true);
    for(const [page,state] of [[p,host],[q,guest]] as const)await expect(page.locator('#action')).toContainText(state.snapshot!.entities.find(e=>e.id===state.id)!.role==='kid'?'LIGHT':'LUNGE');
    expect(host.snapshot!.entities).toHaveLength(4);expect(guest.snapshot!.entities.filter(e=>e.role==='goose')).toHaveLength(1);
    for(const page of [p,q]){
      const sizes=await page.evaluate(()=>({w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight}));expect(sizes.scrollW).toBe(sizes.w);expect(sizes.scrollH).toBe(sizes.h);
      const box=await page.locator('#action').boundingBox();expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(errors).toEqual([]);await a.close();await b.close();
  }
});
