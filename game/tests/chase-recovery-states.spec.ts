import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createChaseServer} from '../server/chase-server';
import {watchChase} from './chase-browser-helpers';
test('private seat refreshes in every round stage and server restart returns both clients to title',async({browser})=>{
  test.setTimeout(60000);let game=createChaseServer({clientDir:resolve('dist/client')});await new Promise<void>(r=>game.server.listen(0,'127.0.0.1',r));const port=(game.server.address() as {port:number}).port,url=`http://127.0.0.1:${port}`;
  const a=await browser.newContext({viewport:{width:667,height:375}}),b=await browser.newContext({viewport:{width:1366,height:768}}),stages:string[]=[];
  try{
    const p=await a.newPage(),q=await b.newPage(),one=watchChase(p),two=watchChase(q);await p.goto(url);await p.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>one.snapshot?.solo).toBeTruthy();
    const id=one.id,credential=await p.evaluate(()=>sessionStorage.getItem('ddg-seat'));let received=one.receivedAt;await p.reload();await expect.poll(()=>one.receivedAt).toBeGreaterThan(received);expect(one.id).toBe(id);stages.push('solo');
    await q.goto(url);await q.getByRole('textbox',{name:'Room code'}).fill(one.snapshot!.code);await q.getByRole('button',{name:'Join friends'}).click();await expect.poll(()=>two.snapshot?.multi).toBeTruthy();const room=game.rooms.get(one.snapshot!.code)!;
    // Fixtures hold each real stage while independent browser refreshes run.
    for(const stage of ['joining','countdown','playing','results'] as const){
      room.multi!.stage=stage;room.multi!.deadline=Date.now()+20000;room.sim.phase=stage==='results'||stage==='joining'?'results':'playing';for(const e of room.sim.entities)e.safeUntil=500;
      await expect.poll(()=>one.snapshot?.multi?.stage).toBe(stage);const before=two.snapshot!.now,run=one.snapshot!.multi!.runId;received=one.receivedAt;
      await p.reload();await expect.poll(()=>one.receivedAt).toBeGreaterThan(received);await expect(p.locator('#hud')).toBeVisible();expect(one.id).toBe(id);expect(one.snapshot!.multi!.runId).toBe(run);expect(one.snapshot!.multi!.stage).toBe(stage);expect(await p.evaluate(()=>sessionStorage.getItem('ddg-seat'))).toBe(credential);await expect.poll(()=>two.snapshot!.now).toBeGreaterThan(before);stages.push(stage);
    }
    await game.close();game=createChaseServer({clientDir:resolve('dist/client')});await new Promise<void>(r=>game.server.listen(port,'127.0.0.1',r));
    for(const page of [p,q]){await expect(page.locator('#title')).toBeVisible({timeout:5000});await expect(page.locator('#notice')).toContainText('That night ended');await expect(page.locator('#controls')).toBeHidden();expect(await page.evaluate(()=>sessionStorage.getItem('ddg-seat'))).toBeNull();}
    expect([...one.errors,...two.errors]).toEqual([]);await mkdir('evidence/phase6',{recursive:true});await writeFile('evidence/phase6/recovery-stages.json',JSON.stringify({fixtureHeldStages:true,stages,sameCredential:true,otherSessionContinued:true,restartFriendlyTitleBoth:true,errors:[...one.errors,...two.errors]},null,2));
  }finally{await a.close();await b.close();await game.close();}
});
