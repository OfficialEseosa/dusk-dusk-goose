import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import WebSocket from 'ws';
import {createChaseServer} from '../server/chase-server';
import {watchChase} from './chase-browser-helpers';
test('four and six seats share Cul-de-sac and refresh keeps the same arena and seat',async({browser})=>{
  test.setTimeout(45000);const game=createChaseServer({clientDir:resolve('dist/client')});await new Promise<void>(r=>game.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(game.server.address() as {port:number}).port}`;
  const phone=await browser.newContext({viewport:{width:667,height:375}}),laptop=await browser.newContext({viewport:{width:1366,height:768}}),sockets:WebSocket[]=[];
  const join=async(code:string,name:string)=>{const ws=new WebSocket(`${url.replace('http:','ws:')}/ws`);sockets.push(ws);await new Promise<void>((r,reject)=>{ws.once('open',()=>ws.send(JSON.stringify({type:'join',code,name})));ws.once('error',reject);ws.on('message',(raw,binary)=>{if(!binary&&JSON.parse(raw.toString()).type==='seat')r();});});};
  try{
    const p=await phone.newPage(),q=await laptop.newPage(),one=watchChase(p),two=watchChase(q);await p.goto(url);await p.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>one.snapshot?.code).toBeTruthy();const code=one.snapshot!.code;
    await q.goto(url);await q.getByRole('textbox',{name:'Room code'}).fill(code);await q.getByRole('button',{name:'Join friends'}).click();await join(code,'Third');await join(code,'Fourth');
    await expect.poll(()=>one.snapshot?.multi?.stage,{timeout:10000}).toBe('playing');await expect.poll(()=>two.snapshot?.arena).toBe('culdesac');expect(one.snapshot!.arena).toBe('culdesac');expect(one.snapshot!.lamps).toHaveLength(3);
    const room=game.rooms.get(code)!;for(const e of room.sim.entities)e.safeUntil=500; // Fixture keeps screenshots independent of bot catch timing.
    await expect(p.locator('canvas')).toHaveAttribute('aria-label','The Cul-de-sac');await expect(q.locator('canvas')).toHaveAttribute('aria-label','The Cul-de-sac');
    await p.waitForTimeout(400);await mkdir('evidence/phase6',{recursive:true});await p.screenshot({path:'evidence/phase6/culdesac-four-667.png'});await q.screenshot({path:'evidence/phase6/culdesac-four-1366.png'});
    const alley=room.sim.entities.find(e=>e.id===two.id)!;alley.role='goose';alley.x=15;alley.z=-9;alley.frozenUntil=room.sim.now+.6;await q.waitForTimeout(1000);await q.screenshot({path:'evidence/phase6/culdesac-alley-1366.png'});
    const id=two.id;await q.reload();await expect.poll(()=>two.id).toBe(id);await expect(q.locator('#hud')).toBeVisible();expect(two.snapshot!.arena).toBe('culdesac');
    await join(code,'Fifth');await join(code,'Sixth');expect(room.sim.arena.width).toBe(34);room.sim.phase='results';await expect.poll(()=>room.multi?.stage).toBe('results');room.multi!.deadline=Date.now()+100;
    await expect.poll(()=>one.snapshot?.multi?.stage,{timeout:6000}).toBe('countdown');await expect.poll(()=>one.snapshot?.multi?.startingGeese.length).toBe(2);expect(one.snapshot!.entities).toHaveLength(6);
    await expect.poll(()=>two.snapshot?.multi?.runId).toBe(one.snapshot!.multi!.runId);expect(two.snapshot!.arena).toBe('culdesac');
    for(const page of [p,q]){expect(await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}))).toEqual({x:false,y:false});}
    await p.screenshot({path:'evidence/phase6/culdesac-six-667.png'});await q.screenshot({path:'evidence/phase6/culdesac-six-1366.png'});expect([...one.errors,...two.errors]).toEqual([]);
    await writeFile('evidence/phase6/arena-check.json',JSON.stringify({fixtureDrivenBreak:true,browserSessions:2,additionalWebSocketSeats:4,fourAndSixSameArena:true,threeLamps:true,sixStartsTwoGeese:true,refreshSameSeat:true,noScroll:true,errors:[...one.errors,...two.errors]},null,2));
  }finally{await phone.close();await laptop.close();for(const ws of sockets)ws.terminate();await game.close();}
});
