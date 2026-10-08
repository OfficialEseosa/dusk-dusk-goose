import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';

test('portrait releases input and restores the same seat while laptop keeps playing',async({browser})=>{
  const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true,isMobile:true}),laptop=await browser.newContext({viewport:{width:1366,height:768}});
  await phone.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw new DOMException('Unsupported in this test','NotSupportedError');};});
  try{
    const p=await phone.newPage(),q=await laptop.newPage(),one=watchChase(p),two=watchChase(q);
    await p.goto('/');await p.getByRole('button',{name:'Play',exact:true}).tap();
    await expect.poll(()=>one.snapshot?.code).toBeTruthy();await expect(p.locator('#home-tip')).toBeVisible();
    await p.locator('#home-tip').tap();await expect(p.locator('#home-tip')).toBeHidden();
    expect(await p.evaluate(()=>localStorage.getItem('ddg-home-tip'))).toBe('dismissed');
    await q.goto('/');await q.getByRole('textbox',{name:'Room code'}).fill(one.snapshot!.code);await q.getByRole('button',{name:'Join friends'}).click();
    await expect.poll(()=>one.snapshot?.multi?.stage,{timeout:10000}).toBe('playing');
    const id=one.id,credential=await p.evaluate(()=>sessionStorage.getItem('ddg-seat')),before=two.snapshot!.now;
    await p.setViewportSize({width:375,height:667});await expect(p.locator('#portrait-hint')).toBeVisible();
    await expect.poll(()=>p.evaluate(()=>innerWidth)).toBe(375);const hint=await p.locator('#portrait-hint').boundingBox();expect(hint!.width).toBe(375);expect(hint!.height).toBe(667);
    await expect.poll(()=>one.snapshot?.entities.find(e=>e.id===id)?.bot,{timeout:5000}).toBe(true);
    await expect.poll(()=>two.snapshot!.now).toBeGreaterThan(before+1);
    const inputAt=one.lastInput?.at;await p.waitForTimeout(300);expect(one.lastInput?.at).toBe(inputAt);
    await mkdir('evidence/phase6',{recursive:true});await p.screenshot({path:'evidence/phase6/portrait-375.png'});
    await p.setViewportSize({width:667,height:375});await expect(p.locator('#portrait-hint')).toBeHidden();
    await expect.poll(()=>one.snapshot?.entities.find(e=>e.id===id)?.bot,{timeout:3000}).toBe(false);
    expect(one.id).toBe(id);expect(await p.evaluate(()=>sessionStorage.getItem('ddg-seat'))).toBe(credential);
    expect(one.snapshot!.code).toBe(two.snapshot!.code);
    for(const page of [p,q]){
      expect(await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}))).toEqual({x:false,y:false});
      const action=await page.locator('#action').boundingBox(),stick=await page.locator('#stick').boundingBox();
      expect(action!.width).toBeGreaterThanOrEqual(44);expect(action!.height).toBeGreaterThanOrEqual(44);expect(stick!.width).toBeGreaterThanOrEqual(44);
      const viewport=page.viewportSize()!;for(const box of [action!,stick!]){expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);}
    }
    await p.screenshot({path:'evidence/phase6/landscape-667.png'});await q.screenshot({path:'evidence/phase6/landscape-1366.png'});
    expect([...one.errors,...two.errors]).toEqual([]);
    await writeFile('evidence/phase6/display-check.json',JSON.stringify({unsupportedFullscreenFallback:true,tipDismissed:true,portraitBotCover:true,landscapeSameSeat:true,laptopContinued:true,noScroll:true,controlsReachable:true,physicalFullscreenVerified:false,errors:[...one.errors,...two.errors]},null,2));
  }finally{await phone.close();await laptop.close();}
});
