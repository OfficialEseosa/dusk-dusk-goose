import {test,expect,type Page} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {resolve} from 'node:path';
import {HIDING_SPOTS} from '../shared/round';
import type {RoomSnapshot} from '../shared/protocol';
import {walkAxis,pickUpFlashlight,seeking} from './round-regression-helpers';
const human='http://127.0.0.1:5180',solo='http://127.0.0.1:5181';const children:ChildProcess[]=[];
test.beforeAll(async()=>{
 for(const [port,seekingMs] of [[5180,60000],[5181,4000]]){
  const source=`import {createGameServer} from ${JSON.stringify(new URL('../dist/server/server/index.js',import.meta.url).href)};const game=createGameServer({clientDir:${JSON.stringify(resolve('dist/client'))},roundDurations:{blackoutMs:500,hidingMs:${port===5180?12000:3500},seekingMs:${seekingMs},revealMs:1000,nextRoundMs:6500},clueIntervalMs:10000,clueChoiceMs:300});game.server.listen(${port},'127.0.0.1');`;
  const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:'pipe'});children.push(child);let failure='';child.stderr!.on('data',data=>failure+=data);
  await expect.poll(async()=>{if(child.exitCode!==null)throw new Error(failure);try{return(await fetch(`http://127.0.0.1:${port}`)).status;}catch{return 0;}},{timeout:15000}).toBe(200);
 }
});
test.afterAll(()=>children.forEach(child=>child.kill()));
async function instrumentation(page:Page){await page.addInitScript(()=>{
 const audio={events:[] as {kind:string;duration?:number;frequency?:number;type?:string}[],samples:[] as number[],bands:[] as number[],contexts:[] as AudioContext[],analyser:undefined as AnalyserNode|undefined};(window as any).audioCheck=audio;
 const Base=window.AudioContext;
 window.AudioContext=class extends Base{
  private meter:AnalyserNode;
  constructor(...args:ConstructorParameters<typeof AudioContext>){super(...args);audio.contexts.push(this);this.meter=this.createAnalyser();this.meter.fftSize=2048;this.meter.connect(this.destination);audio.analyser=this.meter;const values=new Float32Array(2048),frequencies=new Float32Array(1024);setInterval(()=>{this.meter.getFloatTimeDomainData(values);audio.samples.push(Math.sqrt(values.reduce((total,v)=>total+v*v,0)/values.length));this.meter.getFloatFrequencyData(frequencies);let power=0;for(let i=Math.ceil(200*2048/this.sampleRate);i<Math.floor(2400*2048/this.sampleRate);i++)power+=Math.pow(10,frequencies[i]/10);audio.bands.push(Math.sqrt(power/2));if(audio.samples.length>400)audio.samples.shift();if(audio.bands.length>400)audio.bands.shift();},20);}
  createGain(){const node=super.createGain(),connect=node.connect.bind(node);node.connect=((destination:AudioNode,...args:any[])=>connect(destination===this.destination?this.meter:destination,...args)) as typeof node.connect;return node;}
  createBufferSource(){const node=super.createBufferSource(),start=node.start.bind(node);node.start=((...args:any[])=>{audio.events.push({kind:'buffer',duration:node.buffer?.duration});return start(...args);}) as typeof node.start;return node;}
  createOscillator(){const node=super.createOscillator(),start=node.start.bind(node);node.start=((...args:any[])=>{audio.events.push({kind:'note',frequency:node.frequency.value,type:node.type});return start(...args);}) as typeof node.start;return node;}
 };
});}
function observe(page:Page){let current:RoomSnapshot;page.on('websocket',ws=>ws.on('framereceived',frame=>{try{const message=JSON.parse(String(frame.payload));if(message.room)current=message.room;}catch{}}));return()=>current;}
async function create(page:Page,url:string,name='Alex'){await page.goto(url);await page.getByLabel('Your name').fill(name);await page.getByRole('button',{name:'Create a night',exact:true}).click();return page.getByTestId('room-code').innerText();}
async function count(page:Page,kind:string,value:number){return page.evaluate(({kind,value})=>(window as any).audioCheck.events.filter((e:any)=>e.kind===kind&&Math.abs((kind==='buffer'?e.duration:e.frequency)-value)<.01).length,{kind,value});}
async function audible(page:Page,lowBand=false){await page.evaluate(()=>{(window as any).audioCheck.samples=[];(window as any).audioCheck.bands=[];});await expect.poll(()=>page.evaluate(low=>Math.max(0,...(low?(window as any).audioCheck.bands:(window as any).audioCheck.samples)),lowBand),{timeout:2500}).toBeGreaterThan(lowBand?.0001:.0003);}
async function silent(page:Page){await page.waitForTimeout(150);await page.evaluate(()=>(window as any).audioCheck.samples=[]);await page.waitForTimeout(400);expect(await page.evaluate(()=>Math.max(0,...(window as any).audioCheck.samples))).toBeLessThan(.000001);}
async function target(page:Page,id:string){const spot=HIDING_SPOTS.find(s=>s.id===id)!;await walkAxis(page,'z',2);await walkAxis(page,'x',spot.x);await walkAxis(page,'z',spot.z);await expect(page.locator('#round-action')).toBeVisible();}

test('real Web Audio delivers footsteps, rummage, radio, freezing and discovery; mute and hidden silence the destination',async({browser})=>{
 test.setTimeout(125000);const laptop=await browser.newContext({viewport:{width:1366,height:768}}),phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true});const a=await laptop.newPage(),b=await phone.newPage();await Promise.all([instrumentation(a),instrumentation(b)]);const room=observe(a),errors:string[]=[];for(const p of[a,b])p.on('pageerror',e=>errors.push(e.message));
 try{
  await a.goto(human);expect(await a.evaluate(()=>(window as any).audioCheck.contexts.length)).toBe(0);const code=await create(a,human);await b.goto(`${human}/?room=${code}`);await b.getByLabel('Your name').fill('Sam');await b.getByRole('button',{name:'Join',exact:true}).click();await a.getByRole('button',{name:'Start the night',exact:true}).click();for(const p of[a,b])await p.locator('canvas[data-ready="true"]').waitFor();await pickUpFlashlight(b);await audible(a);
  const stepBefore=await count(a,'buffer',.105);await a.evaluate(()=>(window as any).audioCheck.bands=[]);await a.keyboard.down('d');await a.waitForTimeout(700);await a.keyboard.up('d');expect(await a.evaluate(()=>Math.max(0,...(window as any).audioCheck.bands))).toBeGreaterThan(.0001);await expect.poll(()=>count(a,'buffer',.105)).toBeGreaterThan(stepBefore);await a.waitForTimeout(180);const stopped=await count(a,'buffer',.105);await a.waitForTimeout(800);expect(await count(a,'buffer',.105)).toBe(stopped);
  await a.locator('#mute').click();await a.keyboard.down('a');await a.waitForTimeout(350);await a.keyboard.up('a');await silent(a);await a.locator('#mute').click();await audible(a);
  // Test-only visibility override exercises the actual visibility listener and destination gain.
  await a.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await silent(a);await a.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await audible(a);
  await seeking(b);await walkAxis(a,'x',-2.4);const freezeBefore=await count(a,'note',880),otherFreezeBefore=await count(b,'note',880);await a.keyboard.down('w');await a.waitForTimeout(1100);await a.keyboard.up('w');await expect.poll(()=>count(a,'note',880)).toBeGreaterThan(freezeBefore);await expect.poll(()=>count(b,'note',880)).toBeGreaterThan(otherFreezeBefore);
  if(await b.locator('#radio-toggle').count()){const crackle=await count(b,'buffer',.32);await a.locator('#radio-toggle').click();await a.locator('#radio-input').fill('Meet me by the pavement');await a.locator('#radio-send').click();await expect.poll(()=>count(b,'buffer',.32)).toBeGreaterThan(crackle);await audible(b);await a.locator('#radio-toggle').click();}
  const capsule=room().round!.capsuleSpotId!,wrong=capsule==='bin-2'?'mailbox-2':'bin-2';await target(b,wrong);const rummage=await count(b,'buffer',.19);await b.keyboard.down('e');await audible(b,true);await b.waitForTimeout(250);await b.keyboard.up('e');await expect.poll(()=>count(b,'buffer',.19)).toBeGreaterThan(rummage);await b.waitForTimeout(250);const rummageStopped=await count(b,'buffer',.19);await b.waitForTimeout(500);expect(await count(b,'buffer',.19)).toBe(rummageStopped);
  await b.keyboard.down('e');await b.waitForTimeout(2250);await b.keyboard.up('e');await expect.poll(()=>b.evaluate(()=>(window as any).audioCheck.events.filter((e:any)=>e.type==='triangle').length)).toBe(1);await b.waitForTimeout(5100);
  await target(b,capsule);const found=await count(b,'note',783.99);await b.keyboard.down('e');await expect(b.locator('#match-panel')).toBeVisible({timeout:4000});await b.keyboard.up('e');await expect.poll(()=>count(b,'note',783.99)).toBeGreaterThan(found);await audible(b,true);expect(errors).toEqual([]);
 }finally{await laptop.close();await phone.close();}
});

test('timeout and final motif play once; refresh waits for a tap and never replays historical round sounds',async({page})=>{
 test.setTimeout(75000);await instrumentation(page);const current=observe(page);await create(page,solo,'Robin');await page.getByRole('button',{name:'Start the night',exact:true}).click();await page.locator('canvas[data-ready="true"]').waitFor();
 for(let round=1;round<=3;round++){await expect.poll(()=>current().match!.roundNumber,{timeout:12000}).toBe(round);await pickUpFlashlight(page);await expect(page.locator('#match-panel')).toBeVisible({timeout:7000});if(round<3){await expect(page.locator('#next-round')).toBeEnabled();await page.locator('#next-round').click();}}
 await expect(page.locator('#play-again')).toBeVisible();await expect.poll(()=>count(page,'note',261.63)).toBe(1);await page.waitForTimeout(1500);await audible(page,true);await page.waitForTimeout(1200);expect(await count(page,'note',261.63)).toBe(1);
 await page.reload();await page.locator('canvas[data-ready="true"]').waitFor();await expect(page.locator('#play-again')).toBeVisible();expect(await page.evaluate(()=>(window as any).audioCheck.contexts.length)).toBe(0);
 await page.locator('#match-title').click();await expect.poll(()=>count(page,'note',261.63)).toBe(1);await audible(page,true);expect(await count(page,'note',293.66)).toBe(0);expect(await count(page,'note',783.99)).toBe(0);
 await page.locator('#mute').click();await silent(page);await page.locator('#mute').click();await audible(page);expect(await count(page,'note',261.63)).toBe(1);
});


test('a replay before the first tap discards the old final motif without suppressing the next match ending',async({page,context})=>{
 test.setTimeout(90000);await page.setViewportSize({width:667,height:375});await instrumentation(page);const current=observe(page);const code=await create(page,solo,'Robin');await page.getByRole('button',{name:'Start the night',exact:true}).click();await page.locator('canvas[data-ready="true"]').waitFor();
 for(let round=1;round<=3;round++){await expect.poll(()=>current().match!.roundNumber,{timeout:12000}).toBe(round);await pickUpFlashlight(page);await expect(page.locator('#match-panel')).toBeVisible({timeout:7000});if(round<3){await expect(page.locator('#next-round')).toBeEnabled();await page.locator('#next-round').click();}}
 await expect(page.locator('#play-again')).toBeVisible();const oldMatch=current().match!.id;await page.reload();await page.locator('canvas[data-ready="true"]').waitFor();await expect(page.locator('#play-again')).toBeVisible();expect(await page.evaluate(()=>(window as any).audioCheck.contexts.length)).toBe(0);
 const friend=await context.newPage();await friend.goto(`${solo}/?room=${code}`);await friend.getByLabel('Your name').fill('Sam');await friend.getByRole('button',{name:'Join',exact:true}).click();await friend.locator('canvas[data-ready="true"]').waitFor();await friend.locator('#play-again').click();await expect.poll(()=>current().match!.id).not.toBe(oldMatch);await expect(page.locator('#match-panel')).toBeHidden();
 await page.mouse.click(500,170);await expect.poll(()=>page.evaluate(()=>(window as any).audioCheck.contexts[0]?.state)).toBe('running');await page.waitForTimeout(500);expect(await count(page,'note',261.63)).toBe(0);
 for(let round=1;round<=4;round++){await expect.poll(()=>current().match!.roundNumber,{timeout:12000}).toBe(round);await expect(page.locator('#match-panel')).toBeVisible({timeout:12000});if(round<4){await expect(page.locator('#next-round')).toBeEnabled();await page.locator('#next-round').click();}}
 await expect(page.locator('#play-again')).toBeVisible();await expect.poll(()=>count(page,'note',261.63)).toBe(1);await page.waitForTimeout(1500);await audible(page,true);await page.waitForTimeout(1000);expect(await count(page,'note',261.63)).toBe(1);await friend.close();
});
