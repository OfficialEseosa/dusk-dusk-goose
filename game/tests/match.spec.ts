import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {resolve} from 'node:path';
import type {RoomSnapshot,ServerMessage} from '../shared/protocol';
import {pickUpFlashlight} from './round-regression-helpers';

const address='http://127.0.0.1:5177';let child:ChildProcess;
test.beforeAll(async()=>{
 const source=`import {createGameServer} from ${JSON.stringify(new URL('../dist/server/server/index.js',import.meta.url).href)}; const game=createGameServer({clientDir:${JSON.stringify(resolve('dist/client'))},roundDurations:{blackoutMs:100,hidingMs:2000,seekingMs:5000,revealMs:1200,nextRoundMs:7000}}); game.server.listen(5177,'127.0.0.1');`;
 child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:'pipe'});
 let failure='';child.stderr!.on('data',data=>{failure+=data;});
 await expect.poll(async()=>{if(child.exitCode!==null)throw new Error(failure);try{return(await fetch(address)).status;}catch{return 0;}},{timeout:15000}).toBe(200);
});
test.afterAll(()=>child?.kill());
function observe(page:Page){const frames:ServerMessage[]=[];page.on('websocket',ws=>ws.on('framereceived',f=>{try{frames.push(JSON.parse(String(f.payload)));}catch{}}));return()=>frames.flatMap(m=>'room'in m&&m.room?[m.room]:[]).at(-1)!;}
async function create(page:Page,name:string){await page.goto(address);await page.getByLabel('Your name').fill(name);await page.getByRole('button',{name:'Create a night',exact:true}).click();return page.getByTestId('room-code').innerText();}
async function join(page:Page,code:string,name:string){await page.goto(`${address}/?room=${code}`);await page.getByLabel('Your name').fill(name);await page.getByRole('button',{name:'Join',exact:true}).click();}
async function ready(page:Page){await page.locator('canvas[data-ready="true"]').waitFor();}
async function reveal(page:Page){await expect(page.locator('#match-panel')).toBeVisible({timeout:20000});}
async function screen(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight)).toBe(true);const bad=await page.locator('#match-panel').evaluate(panel=>[...panel.querySelectorAll('button,p,h2,span')].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();const font=parseFloat(getComputedStyle(e).fontSize);return r.x<0||r.y<0||r.right>innerWidth||r.bottom>innerHeight||font<16||(e.tagName==='BUTTON'&&r.height<44);}).map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON(),font:getComputedStyle(e).fontSize})));expect(bad).toEqual([]);}
async function round(page:Page,current:()=>RoomSnapshot,n:number){await expect.poll(()=>current()?.match?.roundNumber,{timeout:15000}).toBe(n);await expect(page.locator('#match-panel')).toBeHidden();await ready(page);}
async function faster(page:Page){await expect(page.locator('#next-round')).toBeEnabled({timeout:4000});await page.locator('#next-round').click();}

test('solo completes three rounds, refreshes both score screens, remembers best and replays',async({browser})=>{
 test.setTimeout(90000);const context=await browser.newContext({viewport:{width:667,height:375},hasTouch:true});const page=await context.newPage(),current=observe(page);const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 try{await create(page,'Robin');await page.evaluate(()=>localStorage.setItem('maple:solo-best:v1','17'));await page.getByRole('button',{name:'Start the night',exact:true}).click();await ready(page);
 const id=current().match!.id;for(let n=1;n<=3;n++){
  await round(page,current,n);await pickUpFlashlight(page);await reveal(page);expect(current().match!.totalRounds).toBe(3);expect(current().match!.scores[0].score).toBe(0);await screen(page);
  if(n===1){await page.screenshot({path:'../design/step6-between-round-phone.png'});const scores=current().match!.scores;await page.reload();await ready(page);await expect(page.locator('#match-panel')).toBeVisible();expect(current().match!.id).toBe(id);expect(current().match!.scores).toEqual(scores);await screen(page);await faster(page);}
  if(n===2){await expect.poll(()=>current().match!.roundNumber,{timeout:10000}).toBe(3);}
 }
 expect(current().match!.phase).toBe('finished');await expect(page.locator('#play-again')).toBeVisible();await expect(page.locator('#solo-best')).toHaveText('Your best match: 17');await page.screenshot({path:'../design/step6-final-phone.png'});
 const final=current().match!;await page.reload();await ready(page);await expect(page.locator('#play-again')).toBeVisible();expect(current().match!.scores).toEqual(final.scores);expect(current().match!.id).toBe(final.id);await expect(page.locator('#solo-best')).toHaveText('Your best match: 17');expect(await page.evaluate(()=>localStorage.getItem('maple:solo-best:v1'))).toBe('17');await screen(page);
 await page.locator('#play-again').click();await expect.poll(()=>current().match!.id).not.toBe(id);expect(current().match!.roundNumber).toBe(1);await expect(page.locator('#match-panel')).toBeHidden();await page.getByRole('button',{name:'Back to title',exact:true}).click();await expect(page.getByRole('button',{name:'Create a night',exact:true})).toBeVisible();expect(errors).toEqual([]);
 }finally{await context.close();}
});

test('two separate phone and laptop sessions finish four alternating rounds with shared scores and replay',async({browser})=>{
 test.setTimeout(90000);const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true}),laptop=await browser.newContext({viewport:{width:1366,height:768}});const a=await phone.newPage(),b=await laptop.newPage(),ac=observe(a),bc=observe(b);
 try{const code=await create(a,'Alex');await join(b,code,'Sam');await a.getByRole('button',{name:'Start the night',exact:true}).click();await Promise.all([ready(a),ready(b)]);const host=ac().hostId,other=ac().roster!.find(p=>p.id!==host)!.id;
 for(let n=1;n<=4;n++){await round(a,ac,n);expect(ac().round!.hiderId).toBe(n%2?host:other);await Promise.all([reveal(a),reveal(b)]);await expect.poll(()=>bc().match!.scores).toEqual(ac().match!.scores);await screen(a);await screen(b);if(n<4)await faster(a);}
 expect(ac().match!.phase).toBe('finished');expect(ac().match!.scores.map(s=>s.score)).toEqual([10,10]);expect(ac().match!.winnerIds.sort()).toEqual([host,other].sort());
 await a.screenshot({path:'../design/step6-two-player-final-phone.png'});await b.screenshot({path:'../design/step6-two-player-final-laptop.png'});const old=ac().match!.id;await b.reload();await ready(b);expect(bc().match!.scores).toEqual(ac().match!.scores);await b.locator('#play-again').click();await expect.poll(()=>ac().match!.id).not.toBe(old);await expect.poll(()=>bc().match!.id).toBe(ac().match!.id);expect(ac().match!.roundNumber).toBe(1);expect(ac().round!.hiderId).toBe(host);
 }finally{await phone.close();await laptop.close();}
});

test('friend joins solo between rounds, gets a fresh human cycle, and departure does not stall it',async({browser})=>{
 test.setTimeout(90000);const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true}),laptop=await browser.newContext({viewport:{width:1366,height:768}});const a=await phone.newPage(),b=await laptop.newPage(),ac=observe(a),bc=observe(b);
 try{const code=await create(a,'Alex');await a.getByRole('button',{name:'Start the night',exact:true}).click();await ready(a);const old=ac().match!.id;await pickUpFlashlight(a);await reveal(a);await join(b,code,'Sam');await ready(b);await expect(b.locator('canvas')).toHaveAttribute('data-location','prep');await expect(b.locator('canvas')).toHaveAttribute('data-role','waiting');await expect(a.locator('#match-announcement')).toBeVisible();await faster(a);await expect.poll(()=>ac().match!.id).not.toBe(old);expect(ac().match!.roundNumber).toBe(1);expect(ac().match!.totalRounds).toBe(4);expect(ac().round!.hiderId).not.toBeNull();expect(ac().match!.scores.map(s=>s.score)).toEqual([0,0]);await expect(a.locator('#match-banner')).toContainText(/group|joined|fresh|new/i);
 await Promise.all([reveal(a),reveal(b)]);const twoCycle=ac().match!.id;await b.locator('#match-leave').click();await faster(a);await expect.poll(()=>ac().match!.id).not.toBe(twoCycle);expect(ac().match!.solo).toBe(true);expect(ac().match!.totalRounds).toBe(3);await round(a,ac,1);await pickUpFlashlight(a);await reveal(a);expect(ac().match!.roundNumber).toBe(1);expect(bc().match?.phase).not.toBe('finished');
 }finally{await phone.close();await laptop.close();}
});

test('six-player scorecards fit phone and laptop with long names and persistent controls',async({browser})=>{
 test.setTimeout(95000);const {WebSocket}=await import('ws');const bots:InstanceType<typeof WebSocket>[]=[];
 const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true}),laptop=await browser.newContext({viewport:{width:1366,height:768}});const a=await phone.newPage(),b=await laptop.newPage(),ac=observe(a),bc=observe(b);
 try{
  const code=await create(a,'Alexandra Maple Street A');await join(b,code,'Samson Maple Street West');
  for(let i=0;i<4;i++){const ws=new WebSocket(`${address.replace('http','ws')}/live`,{origin:address});bots.push(ws);await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('bot join timed out')),5000);ws.on('error',reject);ws.on('open',()=>ws.send(JSON.stringify({id:'join',type:'join',code,name:`Neighbour ${i} Maple Street`})));ws.on('message',data=>{const msg=JSON.parse(String(data));if(msg.type==='result'&&msg.id==='join'){clearTimeout(timer);msg.ok?resolve():reject(new Error(JSON.stringify(msg)));}});});}
  await a.getByRole('button',{name:'Start the night',exact:true}).click();await Promise.all([ready(a),ready(b)]);
  for(const p of[a,b])await p.evaluate(()=>{(window as any).stableMatchNodes=['#move-stick','#round-action','#match-panel'].map(selector=>document.querySelector(selector));});
  for(let n=1;n<=6;n++){
   await round(a,ac,n);expect(ac().match!.totalRounds).toBe(6);await Promise.all([reveal(a),reveal(b)]);await expect(a.locator('#match-scores li:not([hidden])')).toHaveCount(6);await screen(a);await screen(b);await expect.poll(()=>bc().match!.scores).toEqual(ac().match!.scores);
   for(const p of[a,b])expect(await p.evaluate(()=>['#move-stick','#round-action','#match-panel'].every((selector,i)=>document.querySelector(selector)===(window as any).stableMatchNodes[i]))).toBe(true);
   if(n===1){
    await b.locator('#radio-toggle').click();const text='All six of us are still here. Meet by the windows for the next round.';await b.locator('#radio-input').fill(text);await b.locator('#radio-send').click();await b.locator('#radio-toggle').click();
    for(const p of[a,b]){await expect(p.locator('#radio-panel')).toBeHidden();await expect(p.locator('#clue-transmission')).toBeVisible();await expect(p.locator('#clue-transmission')).toContainText(text);expect(await p.evaluate(()=>{const caption=document.querySelector('#clue-transmission')!.getBoundingClientRect(),panel=document.querySelector('#match-panel')!.getBoundingClientRect();return caption.x>=panel.x&&caption.right<=panel.right&&caption.y>=panel.y&&caption.bottom<=panel.bottom;})).toBe(true);await screen(p);}
    await a.screenshot({path:'../design/step7-six-player-score-radio-phone.png'});await b.screenshot({path:'../design/step7-six-player-score-radio-laptop.png'});
    await a.screenshot({path:'../design/step6-six-player-between-phone.png'});await b.screenshot({path:'../design/step6-six-player-between-laptop.png'});
   }
   if(n<6)await faster(a);
  }
  expect(ac().match!.phase).toBe('finished');expect(ac().match!.winnerIds).toHaveLength(6);await expect(a.locator('#match-scores .score-earned')).toHaveText(['Winner','Winner','Winner','Winner','Winner','Winner']);await a.screenshot({path:'../design/step6-six-player-final-phone.png'});await b.screenshot({path:'../design/step6-six-player-final-laptop.png'});
 }finally{for(const ws of bots)ws.close();await phone.close();await laptop.close();}
});
