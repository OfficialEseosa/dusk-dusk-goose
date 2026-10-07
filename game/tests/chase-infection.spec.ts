import {test,expect,type Page} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';
test('a converted human immediately turns and catches the human friend beside them',async({browser})=>{
  test.setTimeout(55000);const contexts=await Promise.all([{width:667,height:375},{width:1366,height:768},{width:667,height:375}].map(viewport=>browser.newContext({viewport})));
  try{
    const pages=await Promise.all(contexts.map(c=>c.newPage())),states=pages.map(watchChase);const names=['Alex','Riley','Sam'];
    await pages[0].goto('/');await pages[0].getByRole('textbox',{name:'Your name'}).fill(names[0]);await pages[0].getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>states[0].snapshot?.code).toBeTruthy();
    await Promise.all(pages.slice(1).map(async(page,i)=>{await page.goto('/');await page.getByRole('textbox',{name:'Your name'}).fill(names[i+1]);await page.getByRole('textbox',{name:'Room code'}).fill(states[0].snapshot!.code);await page.getByRole('button',{name:'Join friends'}).click();}));
    await expect.poll(()=>states.every(s=>s.snapshot?.multi?.stage==='playing'),{timeout:12000}).toBe(true);
    const entity=(i:number)=>states[i].snapshot!.entities.find(e=>e.id===states[i].id)!;
    const goose=states.findIndex((_,i)=>entity(i).role==='goose'),kids=states.map((_,i)=>i).filter(i=>entity(i).role==='kid').sort((a,b)=>entity(b).x-entity(a).x);expect(kids).toHaveLength(2);const [victim,friend]=kids;
    async function move(page:Page,index:number,axis:'x'|'z',target:number){await page.bringToFront();await page.locator('canvas').click();await expect.poll(()=>page.evaluate(()=>document.hasFocus())).toBe(true);await page.waitForTimeout(100);
      for(let attempt=0;attempt<3;attempt++){const delta=target-entity(index)[axis];if(Math.abs(delta)<.3)return;const key=axis==='x'?delta>0?'KeyD':'KeyA':delta>0?'KeyS':'KeyW';await page.keyboard.down(key);await page.waitForTimeout(Math.abs(delta)/5.5*1000);await page.keyboard.up(key);await page.waitForTimeout(180);}expect(Math.abs(target-entity(index)[axis])).toBeLessThan(.3);
    }
    await expect.poll(()=>states[goose].snapshot!.now-entity(goose).safeUntil).toBeGreaterThan(0);
    await move(pages[goose],goose,'z',7.3);await move(pages[goose],goose,'x',entity(victim).x+.55);
    await expect.poll(()=>entity(victim).role,{timeout:3000}).toBe('goose');expect(entity(friend).role).toBe('kid');
    const first=states[victim].snapshot!.events.find(e=>e.type==='catch'&&e.target===states[victim].id)!;expect(first.actor).toBe(states[goose].id);
    await expect.poll(()=>states[victim].snapshot!.now-entity(victim).safeUntil,{timeout:3000}).toBeGreaterThan(0);
    await pages[victim].bringToFront();await pages[victim].locator('canvas').click();await pages[victim].waitForTimeout(100);await pages[victim].keyboard.down('KeyA');await pages[victim].waitForTimeout(90);await pages[victim].keyboard.up('KeyA');await pages[victim].keyboard.press('Space');
    await expect.poll(()=>entity(friend).role,{timeout:3000}).toBe('goose');
    const second=states[friend].snapshot!.events.find(e=>e.type==='catch'&&e.target===states[friend].id)!;expect(second.actor).toBe(states[victim].id);expect(second.at-first.at).toBeLessThan(3);
    for(const index of [victim,friend])await expect(pages[index].locator('#action')).toContainText('LUNGE');
    await expect.poll(()=>states.every(s=>s.snapshot!.events.some(e=>e.id===second.id&&e.actor===states[victim].id&&e.target===states[friend].id))).toBe(true);
    await mkdir('evidence/phase3',{recursive:true});await writeFile('evidence/phase3/human-infection.json',JSON.stringify({firstActor:names[goose],convertedPlayer:names[victim],secondVictim:names[friend],secondsBetweenCatches:second.at-first.at,errors:states.flatMap(s=>s.errors)},null,2));expect(states.flatMap(s=>s.errors)).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
