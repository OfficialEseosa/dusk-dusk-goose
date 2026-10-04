import {test,expect} from '@playwright/test';
test('full ground beam fits four phone directions',async({browser})=>{
 test.setTimeout(60000);
 const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true}),laptop=await browser.newContext({viewport:{width:1366,height:768}});
 const a=await phone.newPage(),b=await laptop.newPage();
 try{
 await a.goto('/');await a.getByLabel('Your name').fill('Alex');await a.getByRole('button',{name:'Create a night',exact:true}).click();const code=await a.getByTestId('room-code').innerText();
 await b.goto(`/?room=${code}`);await b.getByLabel('Your name').fill('Sam');await b.getByRole('button',{name:'Join',exact:true}).click();await a.getByRole('button',{name:'Start the night',exact:true}).click();
 for(const p of [a,b])await p.locator('canvas[data-ready="true"]').waitFor();
 await b.keyboard.down('w');await b.waitForTimeout(700);await b.keyboard.up('w');await a.locator('canvas[data-lit="false"]').waitFor();
 for(const [direction,key] of [['north','w'],['east','d'],['south','s'],['west','a']]){
 await a.keyboard.down(key);await a.waitForTimeout(60);await a.keyboard.up(key);
 for(let i=0;i<4;i++){const points=JSON.parse(await a.locator('canvas').getAttribute('data-beam-bounds')??'[]');expect(points.length).toBe(64);for(const p of points){expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x).toBeLessThanOrEqual(667);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.y).toBeLessThanOrEqual(375);}await a.waitForTimeout(150);}
 await a.waitForTimeout(1000);const height=Number(await a.locator('canvas').getAttribute('data-character-height'));console.log(direction,height);expect(height).toBeGreaterThanOrEqual(40);await a.screenshot({path:`../design/ground-beam-${direction}-667x375.png`});
 }
 await b.screenshot({path:'../design/ground-beam-laptop-1366x768.png'});
 expect(await a.locator('canvas').getAttribute('data-flashlight')).toBe(await b.locator('canvas').getAttribute('data-flashlight'));
 for(const p of [a,b])expect(await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight)).toBe(true);
 }finally{await phone.close();await laptop.close();}
});
