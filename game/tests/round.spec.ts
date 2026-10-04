import {test,expect,type Page} from '@playwright/test';
import {walkAxis,pickUpFlashlight,seeking,localPose} from './round-regression-helpers';
async function create(p:Page){await p.goto('/');await p.getByLabel('Your name').fill('Alex');await p.getByRole('button',{name:'Create a night',exact:true}).click();return p.getByTestId('room-code').innerText();}
async function join(p:Page,code:string,name:string){await p.goto(`/?room=${code}`);await p.getByLabel('Your name').fill(name);await p.getByRole('button',{name:'Join',exact:true}).click();}
async function spot(p:Page,x:number,z:number){await walkAxis(p,'z',2);await walkAxis(p,'x',x);await walkAxis(p,'z',z);}
test('two independent sessions complete a human round, secret search, cooldown, refresh and rotation',async({browser})=>{
 test.setTimeout(115000);
 const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true}),laptop=await browser.newContext({viewport:{width:1366,height:768}});
 const a=await laptop.newPage(),b=await phone.newPage(),frames:any[]=[];
 b.on('websocket',ws=>ws.on('framereceived',f=>{try{frames.push(JSON.parse(String(f.payload)));}catch{}}));
 await b.addInitScript(()=>{const Base=window.AudioContext;(window as any).noiseTones=0;window.AudioContext=class extends Base{createOscillator(){const o=super.createOscillator();const original=o.start.bind(o);o.start=(...args)=>{if(o.type==='triangle')(window as any).noiseTones++;original(...args);};return o;}};});
 try{
 const code=await create(a);await join(b,code,'Sam');await a.getByRole('button',{name:'Start the night',exact:true}).click();for(const p of [a,b])await p.locator('canvas[data-ready="true"]').waitFor();
 await expect(a.locator('canvas')).toHaveAttribute('data-role','hider');await expect(b.locator('canvas')).toHaveAttribute('data-location','prep');
 await b.screenshot({path:'../design/step4-preparation-seeker-phone.png'});await pickUpFlashlight(b);
 await spot(a,-7.8,-6.5);await a.locator('canvas[data-lit="false"]').waitFor();await expect(a.locator('#round-action')).toHaveText(/Bury here/);await a.locator('#round-action').click();
 const hiderPosition=await localPose(a);await a.reload();await a.locator('canvas[data-ready="true"]').waitFor();await expect(a.locator('canvas')).toHaveAttribute('data-role','hider');expect((await localPose(a)).x).toBeCloseTo(hiderPosition.x,1);
 await b.reload();await b.locator('canvas[data-ready="true"]').waitFor();await expect(b.locator('canvas')).toHaveAttribute('data-role','seeker');await expect(b.locator('canvas')).toHaveAttribute('data-location','prep');await expect(b.locator('#round-instruction')).toContainText('Explore');
 await seeking(b);await expect(a.locator('#round-action')).toBeHidden();
 expect(frames.every(m=>!JSON.stringify(m).includes('capsuleSpotId'))).toBe(true);
 await spot(b,-1.9,-5.9);await expect(b.locator('#round-action')).toBeVisible();
 await b.keyboard.down('e');await b.waitForTimeout(900);await b.keyboard.up('e');await b.waitForTimeout(200);await expect(b.locator('canvas')).toHaveAttribute('data-round-phase','seeking');expect(frames.filter(m=>m.type==='search_noise').length).toBe(0);
 const touch=await phone.newCDPSession(b),button=await b.locator('#round-action').boundingBox();await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:button!.x+button!.width/2,y:button!.y+button!.height/2}]});await expect(b.locator('.action-progress')).not.toHaveCSS('transform','matrix(0, 0, 0, 1, 0, 0)');await b.waitForTimeout(2350);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 expect(frames.filter(m=>m.type==='search_noise').length).toBe(1);const cooldownRoom=frames.map(m=>m.room).filter(Boolean).find(r=>r.players.some((p:any)=>(p.cooldownUntil??0)>r.serverTime));expect(cooldownRoom.players.find((p:any)=>p.cooldownUntil>cooldownRoom.serverTime).cooldownUntil-cooldownRoom.serverTime).toBeGreaterThanOrEqual(4900);await expect(b.locator('#round-instruction')).toContainText('Try another spot');expect(await b.evaluate(()=>(window as any).noiseTones)).toBeGreaterThan(0);
 await b.reload();await b.locator('canvas[data-ready="true"]').waitFor();await expect(b.locator('#round-instruction')).toContainText('Try another spot');await expect(b.locator('canvas')).toHaveAttribute('data-location','street');
 const late=await phone.newPage();await join(late,code,'Jess');await late.locator('canvas[data-ready="true"]').waitFor();await expect(late.locator('canvas')).toHaveAttribute('data-role','waiting');await expect(late.locator('canvas')).toHaveAttribute('data-location','prep');await late.screenshot({path:'../design/step4-preparation-phone.png'});
 await spot(b,-7.8,-6.5);await expect(b.locator('#round-action')).toBeVisible();expect(frames.every(m=>!JSON.stringify(m).includes('capsuleSpotId'))).toBe(true);
 const rightButton=await b.locator('#round-action').boundingBox();await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rightButton!.x+rightButton!.width/2,y:rightButton!.y+rightButton!.height/2}]});await expect(b.locator('canvas')).toHaveAttribute('data-round-phase','reveal',{timeout:4000});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(a.locator('canvas')).toHaveAttribute('data-round-phase','reveal');await expect(a.locator('#round-instruction')).toContainText('Sam found it');
 expect(frames.some(m=>JSON.stringify(m).includes('capsuleSpotId'))).toBe(true);await b.screenshot({path:'../design/step4-reveal-phone.png'});
 const capsuleBox=await b.locator('.capsule-label:not([hidden])').boundingBox();expect(capsuleBox).not.toBeNull();
 for(const box of await b.locator('.player-label:not([hidden])').evaluateAll(labels=>labels.map(label=>{const r=label.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}))){const c=capsuleBox!;expect(box.x<c.x+c.width&&box.x+box.width>c.x&&box.y<c.y+c.height&&box.y+box.height>c.y).toBe(false);}
 await b.screenshot({path:'../design/step5-reveal-labels-phone.png'});

 await expect(a.locator('#next-round')).toBeEnabled({timeout:6000});await a.locator('#next-round').click();await expect(b.locator('canvas')).toHaveAttribute('data-role','hider');await expect(a.locator('canvas')).toHaveAttribute('data-role','seeker');await expect(late.locator('canvas')).toHaveAttribute('data-role','seeker');
 for(const p of [a,b,late])expect(await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight)).toBe(true);
 }finally{await phone.close();await laptop.close();}
});
test('solo pickup, full timed search phase, timeout reveal and next round on phone',async({page})=>{
 test.setTimeout(150000);await page.setViewportSize({width:667,height:375});await create(page);await page.getByRole('button',{name:'Start the night',exact:true}).click();await page.locator('canvas[data-ready="true"]').waitFor();await pickUpFlashlight(page);await seeking(page);
 await expect(page.locator('#round-clock')).toHaveText('2:00');await spot(page,-1.9,-5.9);
 const button=await page.locator('#round-action').boundingBox();expect(button!.x).toBeGreaterThan(500);expect(button!.y+button!.height).toBeLessThanOrEqual(375);expect(button!.width).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:'../design/step4-search-phone.png'});
 // Real pointer hold and early release must cancel, rather than completing later.
 await page.mouse.move(button!.x+button!.width/2,button!.y+button!.height/2);await page.mouse.down();await page.waitForTimeout(700);await page.mouse.up();await page.waitForTimeout(1700);await expect(page.locator('canvas')).toHaveAttribute('data-round-phase','seeking');
 await expect(page.locator('canvas')).toHaveAttribute('data-round-phase','reveal',{timeout:125000});await expect(page.locator('#round-instruction')).toContainText('Time is up');await expect(page.locator('#next-round')).toBeEnabled({timeout:6000});await page.locator('#next-round').click();await expect(page.locator('canvas')).toHaveAttribute('data-location','prep');await pickUpFlashlight(page);await seeking(page);expect(await page.evaluate(()=>document.documentElement.scrollHeight===innerHeight)).toBe(true);
});
