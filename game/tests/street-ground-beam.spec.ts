import {test,expect} from '@playwright/test';
import {pickUpFlashlight,seeking} from './round-regression-helpers';
test('full ground beam fits four phone directions',async({browser})=>{
 test.setTimeout(90000);
 const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true}),laptop=await browser.newContext({viewport:{width:1366,height:768}});
 const a=await phone.newPage(),b=await laptop.newPage(),host=await laptop.newPage();
 try{
 await host.goto('/');await host.getByLabel('Your name').fill('Hider');await host.getByRole('button',{name:'Create a night',exact:true}).click();const code=await host.getByTestId('room-code').innerText();
 for(const [p,name] of [[a,'Alex'],[b,'Sam']] as const){await p.goto(`/?room=${code}`);await p.getByLabel('Your name').fill(name);await p.getByRole('button',{name:'Join',exact:true}).click();await expect(p.getByRole('list',{name:'Players'})).toContainText(`${name} (you)`);}
 await host.getByRole('button',{name:'Start the night',exact:true}).click();
 for(const p of [a,b])await p.locator('canvas[data-ready="true"]').waitFor();
 await Promise.all([pickUpFlashlight(a),pickUpFlashlight(b)]);await Promise.all([seeking(a),seeking(b)]);
 await b.keyboard.down('w');await b.waitForTimeout(700);await b.keyboard.up('w');await a.locator('canvas[data-lit="false"]').waitFor();
 for(const [direction,key] of [['north','w'],['east','d'],['south','s'],['west','a']]){
 await a.keyboard.down(key);await a.waitForTimeout(60);await a.keyboard.up(key);
 for(let i=0;i<4;i++){const points=JSON.parse(await a.locator('canvas').getAttribute('data-beam-bounds')??'[]');expect(points.length).toBe(64);for(const p of points){expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThanOrEqual(667);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.y).toBeLessThanOrEqual(375);}await a.waitForTimeout(150);}
 await a.waitForTimeout(1000);expect(await a.evaluate(()=>{const body=JSON.parse(document.querySelector<HTMLCanvasElement>('canvas')!.dataset.characterBounds??'null'),button=document.querySelector('#radio-toggle')?.getBoundingClientRect();return Boolean(body&&button&&!(body.x<button.right&&body.x+body.width>button.x&&body.y<button.bottom&&body.y+body.height>button.y));})).toBe(true);const height=Number(await a.locator('canvas').getAttribute('data-character-height'));console.log(direction,height);expect(height).toBeGreaterThanOrEqual(40);await a.screenshot({path:`../design/step4-ground-beam-${direction}-667x375.png`});
 }
 await b.screenshot({path:'../design/step4-ground-beam-laptop-1366x768.png'});
 expect(await a.locator('canvas').getAttribute('data-flashlight')).toBe(await b.locator('canvas').getAttribute('data-flashlight'));
 for(const p of [a,b])expect(await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight)).toBe(true);
 }finally{await phone.close();await laptop.close();}
});
