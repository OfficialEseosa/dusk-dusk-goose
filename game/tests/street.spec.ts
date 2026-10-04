import {test,expect,type Page} from '@playwright/test';
import {writeFile} from 'node:fs/promises';

async function begin(page:Page){await page.goto('/');await page.getByLabel('Your name').fill('Alex');await page.getByRole('button',{name:'Create a night',exact:true}).click();await expect(page.getByTestId('room-code')).toBeVisible();return page.getByTestId('room-code').innerText();}
test('street: shared blackout, smooth poses, stable controls, refresh and late join',async({browser})=>{
  const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true});const laptop=await browser.newContext({viewport:{width:1366,height:768}});
  const a=await phone.newPage(),b=await laptop.newPage();const errors:string[]=[];
  for(const p of [a,b])p.on('pageerror',e=>errors.push(e.message));
  try{
    const code=await begin(a);await b.goto(`/?room=${code}`);await b.getByLabel('Your name').fill('Sam');await b.getByRole('button',{name:'Join',exact:true}).click();await expect(b.getByRole('list',{name:'Players'})).toContainText('Sam (you)');
    await a.getByRole('button',{name:'Start the night',exact:true}).click();
    await expect(a.locator('canvas[data-ready="true"]')).toBeVisible();await expect(b.locator('canvas[data-ready="true"]')).toBeVisible();
    await expect(a.locator('canvas')).toHaveAttribute('data-lit','true');await expect(b.locator('canvas')).toHaveAttribute('data-lit','true');
    const identity=await a.evaluate(()=>JSON.parse(sessionStorage.getItem('maple:seat:v1')!));
    await a.evaluate(()=>{(window as unknown as {stick:Element}).stick=document.querySelector('#move-stick')!;});
    const initial=JSON.parse(await a.locator('canvas').getAttribute('data-playerposes')??'{}')[identity.playerId];
    for(const p of [a,b]) await p.evaluate(({id,x})=>{
      const canvas=document.querySelector('canvas')!;
      const readings={movement:0,blackout:0};
      (window as unknown as {readings:typeof readings}).readings=readings;
      new MutationObserver(()=>{
        const pose=JSON.parse(canvas.dataset.playerposes??'{}')[id];
        if(!readings.movement&&pose&&pose.x>x+0.05)readings.movement=Date.now();
        if(!readings.blackout&&canvas.dataset.lit==='false')readings.blackout=Date.now();
      }).observe(canvas,{attributes:true,attributeFilter:['data-playerposes','data-lit']});
    },{id:identity.playerId,x:initial.x});
    const inputAt=await a.evaluate(()=>Date.now());
    await a.keyboard.down('ArrowRight');await a.waitForTimeout(800);await a.keyboard.up('ArrowRight');
    await a.evaluate(()=>{if((window as unknown as {stick:Element}).stick!==document.querySelector('#move-stick'))throw new Error('Stick remounted');});
    // Data attributes are renderer observations, never extra public server endpoints.
    await expect.poll(async()=>{const poses=JSON.parse(await b.locator('canvas').getAttribute('data-poses')??'[]');return poses.find((p:{id:string})=>p.id===identity.playerId)?.x;}).toBeGreaterThan(initial.x+1);
    await expect.poll(async()=>JSON.parse(await b.locator('canvas').getAttribute('data-playerposes')??'{}')[identity.playerId]?.facing).toBeCloseTo(Math.PI/2,1);
    await expect(a.locator('#street-status')).toHaveText('');
    const movementAt=await b.evaluate(()=>(window as unknown as {readings:{movement:number}}).readings.movement);
    expect(movementAt-inputAt).toBeLessThan(300);
    // Drag the actual persistent control, not a synthetic movement message.
    const thumb=await a.locator('#move-stick').boundingBox();
    await a.mouse.move(thumb!.x+thumb!.width/2,thumb!.y+thumb!.height/2);await a.mouse.down();
    await a.mouse.move(thumb!.x+thumb!.width/2,thumb!.y+thumb!.height/2-40);await a.waitForTimeout(500);await a.mouse.up();
    await expect.poll(async()=>JSON.parse(await a.locator('canvas').getAttribute('data-playerposes')??'{}')[identity.playerId]?.z).toBeLessThan(initial.z-1);
    for(const p of [a,b])expect(await p.evaluate(()=>document.documentElement.scrollWidth===innerWidth&&document.documentElement.scrollHeight===innerHeight)).toBe(true);
    const stick=await a.locator('#move-stick').boundingBox();expect(stick!.x).toBeLessThan(100);expect(stick!.y+stick!.height).toBeLessThanOrEqual(375);expect(stick!.height).toBeGreaterThanOrEqual(100);
    await Promise.all([expect(a.locator('canvas')).toHaveAttribute('data-lit','false',{timeout:15000}),expect(b.locator('canvas')).toHaveAttribute('data-lit','false',{timeout:15000})]);
    const blackouts=await Promise.all([a,b].map(p=>p.evaluate(()=>(window as unknown as {readings:{blackout:number}}).readings.blackout)));
    expect(Math.abs(blackouts[0]-blackouts[1])).toBeLessThan(150);
    await writeFile('test-results/step2-timing.json',JSON.stringify({movementLatencyMs:movementAt-inputAt,blackoutSkewMs:Math.abs(blackouts[0]-blackouts[1])},null,2));
    console.log(`Remote movement ${movementAt-inputAt} ms; blackout skew ${Math.abs(blackouts[0]-blackouts[1])} ms.`);
    await a.screenshot({path:'test-results/street-phone.png'});await b.screenshot({path:'test-results/street-laptop.png'});
    const position=JSON.parse(await a.locator('canvas').getAttribute('data-poses')??'[]').find((p:{id:string})=>p.id===identity.playerId);
    await a.reload();await expect(a.locator('canvas[data-ready="true"]')).toBeVisible();expect(await a.evaluate(()=>JSON.parse(sessionStorage.getItem('maple:seat:v1')!).playerId)).toBe(identity.playerId);await expect(a.locator('canvas')).toHaveAttribute('data-lit','false');
    await expect.poll(async()=>JSON.parse(await a.locator('canvas').getAttribute('data-poses')??'[]').find((p:{id:string})=>p.id===identity.playerId)?.x).toBeCloseTo(position.x,1);
    const late=await laptop.newPage();await late.goto(`/?room=${code}`);await late.getByLabel('Your name').fill('Late friend');await late.getByRole('button',{name:'Join',exact:true}).click();await expect(late.locator('canvas[data-ready="true"]')).toBeVisible();await expect(late.locator('canvas')).toHaveAttribute('data-lit','false');await late.close();expect(errors).toEqual([]);
  }finally{await phone.close();await laptop.close();}
});

test('a frozen device does not pause the other player or blackout',async({browser})=>{
  const c1=await browser.newContext({viewport:{width:667,height:375}}),c2=await browser.newContext({viewport:{width:1366,height:768}});
  const a=await c1.newPage(),b=await c2.newPage();
  try{
    const code=await begin(a);await b.goto(`/?room=${code}`);await b.getByLabel('Your name').fill('Sam');await b.getByRole('button',{name:'Join',exact:true}).click();await expect(b.getByRole('list',{name:'Players'})).toContainText('Sam');
    await a.getByRole('button',{name:'Start the night',exact:true}).click();await a.locator('canvas[data-ready="true"]').waitFor();await b.locator('canvas[data-ready="true"]').waitFor();
    const id=await b.evaluate(()=>JSON.parse(sessionStorage.getItem('maple:seat:v1')!).playerId);
    const before=JSON.parse(await b.locator('canvas').getAttribute('data-playerposes')??'{}')[id];
    const devtools=await c1.newCDPSession(a);await devtools.send('Page.setWebLifecycleState',{state:'frozen'});
    await b.keyboard.down('d');await b.waitForTimeout(700);await b.keyboard.up('d');
    await expect.poll(async()=>JSON.parse(await b.locator('canvas').getAttribute('data-playerposes')??'{}')[id]?.x).toBeGreaterThan(before.x+1);
    await expect(b.locator('canvas')).toHaveAttribute('data-lit','false',{timeout:15000});
    await devtools.send('Page.setWebLifecycleState',{state:'active'});await expect(a.locator('canvas')).toHaveAttribute('data-lit','false');
    await expect(a.getByRole('list',{name:'Players'})).toContainText('Sam Here');await expect(b.locator('#street-status')).toHaveText('');
  }finally{await c1.close();await c2.close();}
});

test('first tap unlocks sound, blackout stops hum and plays flashlight click',async({page})=>{
  await page.addInitScript(()=>{
    const Original=window.AudioContext;
    const probe={context:null as AudioContext|null,gains:[] as GainNode[],clicks:0,oscillators:0};
    (window as unknown as {audioProbe:typeof probe}).audioProbe=probe;
    window.AudioContext=class extends Original{
      constructor(options?:AudioContextOptions){super(options);probe.context=this;}
      createGain(){const gain=super.createGain();probe.gains.push(gain);return gain;}
      createOscillator(){probe.oscillators++;return super.createOscillator();}
      createBufferSource(){probe.clicks++;return super.createBufferSource();}
    };
  });
  await page.goto('/');
  expect(await page.evaluate(()=>(window as unknown as {audioProbe:{context:AudioContext|null}}).audioProbe.context)).toBeNull();
  await page.getByLabel('Your name').fill('Alex');await page.getByRole('button',{name:'Create a night',exact:true}).click();await page.getByRole('button',{name:'Start the night',exact:true}).click();await page.locator('canvas[data-ready="true"]').waitFor();
  const sound=()=>page.evaluate(()=>{const p=(window as unknown as {audioProbe:{context:AudioContext,gains:GainNode[],clicks:number,oscillators:number}}).audioProbe;return {state:p.context.state,hum:p.gains[1].gain.value,clicks:p.clicks,oscillators:p.oscillators};});
  await expect.poll(async()=>(await sound()).state).toBe('running');await expect.poll(async()=>(await sound()).hum).toBeGreaterThan(0.01);
  await expect(page.locator('canvas')).toHaveAttribute('data-lit','false',{timeout:15000});await expect.poll(async()=>(await sound()).hum).toBeLessThan(0.001);expect((await sound()).clicks).toBe(1);expect((await sound()).oscillators).toBeGreaterThan(2);
  await page.getByRole('button',{name:'Sound on',exact:true}).click();await expect(page.getByRole('button',{name:'Sound off',exact:true})).toBeVisible();
});
