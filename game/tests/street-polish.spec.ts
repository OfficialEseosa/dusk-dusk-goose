import {test,expect,type Page} from '@playwright/test';
import {SOLIDS,PLAYER_RADIUS} from '../shared/street-layout';

async function pose(page:Page){return page.locator('canvas').evaluate(c=>JSON.parse(c.dataset.playerposes??'{}')[c.dataset.localId!]);}
async function walkTo(page:Page,axis:'x'|'z',target:number){
  const before=await pose(page),direction=Math.sign(target-before[axis]);if(Math.abs(target-before[axis])<.08)return;
  const key=axis==='x'?(direction>0?'d':'a'):(direction>0?'s':'w');
  await page.keyboard.down(key);
  try{await page.waitForFunction(({axis,target,direction})=>{const c=document.querySelector('canvas')!;const p=JSON.parse(c.dataset.playerposes??'{}')[c.dataset.localId!];return p&&(p[axis]-target)*direction>=-.06;},{axis,target,direction},{timeout:12000});}
  finally{await page.keyboard.up(key);}
}
async function create(page:Page){await page.goto('/');await page.getByLabel('Your name').fill('Alex');await page.getByRole('button',{name:'Create a night',exact:true}).click();await expect(page.getByTestId('room-code')).toBeVisible();return page.getByTestId('room-code').innerText();}

test('keyboard walking stops at every solid class and can move away',async({page})=>{
  test.setTimeout(90000);
  const cases=[{id:'sedan',x:-17,z:2,key:'w',axis:'z',limit:.75,sign:1},
    {id:'lamp-1',x:-9,z:2,key:'w',axis:'z',limit:-3.45,sign:1},
    {id:'planter-2',x:-2.6,z:2,key:'w',axis:'z',limit:-7.95,sign:1},
    {id:'mailbox-2',x:-7.8,z:2,key:'w',axis:'z',limit:-6.9,sign:1},
    {id:'tree-2',x:0,z:-12.4,key:'a',axis:'x',limit:-.66,sign:1},
    {id:'house-2',x:-6,z:2,key:'w',axis:'z',limit:-11.41,sign:1}] as const;
  for(const item of cases){
    await create(page);await page.getByRole('button',{name:'Start the night',exact:true}).click();await page.locator('canvas[data-ready="true"]').waitFor();
    await walkTo(page,'x',item.x);await walkTo(page,'z',item.z);
    await page.keyboard.down(item.key);await page.waitForTimeout(item.id==='house-2'?4300:item.id==='tree-2'?700:3300);await page.keyboard.up(item.key);
    const stopped=await pose(page);expect(stopped[item.axis]).toBeGreaterThanOrEqual(item.limit-.08);expect(stopped[item.axis]).toBeLessThan(item.limit+.4);
    const solid=SOLIDS.find(s=>s.id===item.id)!;
    expect(stopped.x>solid.minX-PLAYER_RADIUS&&stopped.x<solid.maxX+PLAYER_RADIUS&&stopped.z>solid.minZ-PLAYER_RADIUS&&stopped.z<solid.maxZ+PLAYER_RADIUS).toBe(false);
    await page.keyboard.down(item.key==='a'?'d':'s');await page.waitForTimeout(300);await page.keyboard.up(item.key);expect((await pose(page))[item.axis]).toBeGreaterThan(stopped[item.axis]+.5);
    await page.getByRole('button',{name:'Back to title'}).click();
  }
});

test('phone camera, separated labels and warm beams beside a house',async({browser})=>{
  const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true}),laptop=await browser.newContext({viewport:{width:1366,height:768}});
  const a=await phone.newPage(),b=await laptop.newPage();
  try{
    const code=await create(a);await b.goto(`/?room=${code}`);await b.getByLabel('Your name').fill('Sam');await b.getByRole('button',{name:'Join',exact:true}).click();await expect(b.getByRole('list',{name:'Players'})).toContainText('Sam');
    await a.getByRole('button',{name:'Start the night',exact:true}).click();for(const p of [a,b])await p.locator('canvas[data-ready="true"]').waitFor();
    await walkTo(a,'z',-5.5);await walkTo(b,'z',-4.8);
    await expect(a.locator('canvas')).toHaveAttribute('data-lit','false',{timeout:15000});await a.waitForTimeout(400);
    expect(Number(await a.locator('canvas').getAttribute('data-character-height'))).toBeGreaterThanOrEqual(60);
    expect(await a.locator('canvas').getAttribute('data-flashlight')).toBe(await b.locator('canvas').getAttribute('data-flashlight'));
    // Put the two characters together to exercise label separation.
    await walkTo(b,'x',(await pose(a)).x);
    await b.waitForTimeout(400);
    const rectangles=await a.locator('.player-label:not([hidden])').evaluateAll(labels=>labels.map(l=>{const r=l.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
    expect(rectangles.length).toBe(2);const [r,s]=rectangles;expect(r.x<s.x+s.w&&r.x+r.w>s.x&&r.y<s.y+s.h&&r.y+r.h>s.y).toBe(false);
    await walkTo(b,'x',-2.4);await b.keyboard.down('w');await b.keyboard.down('a');await b.waitForTimeout(60);await b.keyboard.up('w');await b.keyboard.up('a');await a.waitForTimeout(400);
    await a.screenshot({path:'../design/flashlight-pass-phone.png'});await b.screenshot({path:'../design/flashlight-pass-laptop.png'});
    for(const p of [a,b])expect(await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight)).toBe(true);
  }finally{await phone.close();await laptop.close();}
});
