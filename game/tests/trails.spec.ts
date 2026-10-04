import {test,expect,type Page} from '@playwright/test';
import type {RoomSnapshot,ServerMessage} from '../shared/protocol';
import {HIDING_SPOTS} from '../shared/round';
import {groundBeamStrength,trueCluePool} from '../shared/trails';
import {walkAxis,pickUpFlashlight,seeking,localPose} from './round-regression-helpers';

function observe(page:Page){const frames:ServerMessage[]=[];page.on('websocket',socket=>socket.on('framereceived',frame=>{try{frames.push(JSON.parse(String(frame.payload)));}catch{}}));return frames;}
function rooms(frames:ServerMessage[]):RoomSnapshot[]{return frames.flatMap(m=>'room' in m&&m.room?[m.room]:[]);}
function latest(frames:ServerMessage[]){return rooms(frames).at(-1)!;}
async function create(page:Page,name:string){await page.goto('/');await page.getByLabel('Your name').fill(name);await page.getByRole('button',{name:'Create a night',exact:true}).click();return page.getByTestId('room-code').innerText();}
async function join(page:Page,code:string){await page.goto(`/?room=${code}`);await page.getByLabel('Your name').fill('Sam');await page.getByRole('button',{name:'Join',exact:true}).click();}
async function spot(page:Page,x:number,z:number){await walkAxis(page,'z',-5.8);await walkAxis(page,'x',x);await walkAxis(page,'z',z);}
async function turn(page:Page,key:string){await page.keyboard.down(key);await page.waitForTimeout(90);await page.keyboard.up(key);await page.waitForTimeout(220);}
async function assertScreen(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollHeight===innerHeight&&document.documentElement.scrollWidth===innerWidth)).toBe(true);for(const selector of ['#round-phase','#round-clock','#round-instruction','#move-stick']){const element=page.locator(selector);if(!await element.count())continue;const box=await element.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(667);expect(box!.y+box!.height).toBeLessThanOrEqual(375);}}

// This intentionally uses the real production 30/60/90-second schedule, not accelerated timers.
test('human and solo trails, three decoys, beam visibility, freeze and all three true scheduled clues',async({browser})=>{
 test.setTimeout(260000);
 const phone=await browser.newContext({viewport:{width:667,height:375},hasTouch:true}),laptop=await browser.newContext({viewport:{width:1366,height:768}}),soloContext=await browser.newContext({viewport:{width:667,height:375},hasTouch:true});
 const a=await laptop.newPage(),b=await phone.newPage(),solo=await soloContext.newPage(),af=observe(a),bf=observe(b),sf=observe(solo);const errors:string[]=[];for(const page of [a,b,solo]){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});}
 try{
 const code=await create(a,'Alex');await join(b,code);await create(solo,'Robin');
 await a.getByRole('button',{name:'Start the night',exact:true}).click();await solo.getByRole('button',{name:'Start the night',exact:true}).click();
 for(const p of [a,b,solo])await p.locator('canvas[data-ready="true"]').waitFor();
 await Promise.all([pickUpFlashlight(b),pickUpFlashlight(solo)]);await seeking(solo);
 const watchClues=async(page:Page,frames:ServerMessage[],hider?:Page)=>{
  for(let count=1;count<=3;count++){
   if(hider){await expect(hider.locator('#clue-choices')).toBeVisible({timeout:35000});await expect(hider.locator('#clue-choices button')).toHaveCount(3);
    if(count===1){await hider.setViewportSize({width:667,height:375});await assertScreen(hider);
      for(const box of await hider.locator('#clue-choices button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}))){expect(box.w).toBeGreaterThanOrEqual(44);expect(box.h).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.w).toBeLessThanOrEqual(667);expect(box.y+box.h).toBeLessThanOrEqual(375);}
      await hider.screenshot({path:'../design/step5-hider-clue-options-phone.png'});
    }
    if(count!==2)await hider.locator('#clue-choices button').first().click();if(count===1)await hider.setViewportSize({width:1366,height:768});
   }
   await expect.poll(()=>latest(frames).round?.clues?.length??0,{timeout:37000}).toBe(count);
   const room=latest(frames),clue=room.round!.clues!.at(-1)!;
   expect(clue.sentAt-room.round!.seekingStartedAt!).toBeGreaterThanOrEqual(count*30000);
   expect(clue.sentAt-room.round!.seekingStartedAt!).toBeLessThan(count*30000+6500);
   await expect(page.locator('#clue-transmission')).toBeVisible();await expect(page.locator('#clue-transmission')).toContainText(clue.text);
   if(count===1&&hider){await assertScreen(page);await page.screenshot({path:'../design/step5-clue-phone.png'});}
  }
 };
 const watcherErrors:unknown[]=[];const soloClues=watchClues(solo,sf).catch(e=>{watcherErrors.push(e);});
 await spot(a,-7.8,-6.5);await a.locator('canvas[data-lit="false"]').waitFor();await a.locator('#round-action').click();
 for(const [x,z] of [[-1.9,-5.8],[-2.6,-7.4],[-9,-9.5]]){await spot(a,x,z);await expect(a.locator('#round-action')).toContainText('Disturb');await a.locator('#round-action').click();}
 await expect.poll(()=>latest(af).round?.decoysRemaining).toBe(0);expect(latest(af).round!.marks).toHaveLength(4);
 await spot(a,-19.8,-6.5);await expect(a.locator('#round-action')).toBeHidden();
 // Forge a fourth decoy through the existing live connection, bypassing the hidden button.
 await a.evaluate(roundNumber=>{const send=WebSocket.prototype.send;WebSocket.prototype.send=function(data){send.call(this,data);if(typeof data==='string'&&JSON.parse(data).type==='move'){WebSocket.prototype.send=send;send.call(this,JSON.stringify({id:'forged-fourth-decoy',type:'disturb',spotId:'mailbox-1',roundNumber}));}};},latest(af).round!.number);
 await expect.poll(()=>af.find(m=>m.type==='result'&&m.id==='forged-fourth-decoy')).toMatchObject({type:'result',ok:false,error:{code:'decoy_limit'}});
 expect(latest(af).round!.marks).toHaveLength(4);

 await seeking(b);await expect(a.locator('#round-action')).toBeHidden();const humanClues=watchClues(b,bf,a).catch(e=>{watcherErrors.push(e);});
 const instruction=await b.locator('#round-instruction').boundingBox();expect(instruction!.y).toBeGreaterThan(300);
 expect(latest(bf).round!.marks).toHaveLength(4);expect(latest(sf).round!.marks).toHaveLength(4);expect(latest(sf).round!.footprints!.length).toBeGreaterThan(20);
 // Face away from every trail, then toward the burial path. Received data stays the same; only its beam visibility changes.
 await turn(b,'s');await expect(b.locator('canvas')).toHaveAttribute('data-footprints-visible','0');await expect(b.locator('canvas')).toHaveAttribute('data-marks-visible','0');
 await walkAxis(b,'x',-7.8);await walkAxis(b,'z',0);await turn(b,'w');
 await expect.poll(async()=>Number(await b.locator('canvas').getAttribute('data-footprints-visible'))).toBeGreaterThan(0);
 await expect.poll(async()=>Number(await b.locator('canvas').getAttribute('data-marks-visible'))).toBeGreaterThan(0);
 await assertScreen(b);await b.screenshot({path:'../design/step5-footprints-phone.png'});
 // Put the human hider in this seeker's actual world-space cone and verify the same freeze on both screens.
 await turn(b,'s');await walkAxis(a,'z',-5.8);await walkAxis(a,'x',-7.8);await walkAxis(a,'z',-2.5);await turn(b,'w');
 await expect(a.locator('canvas')).toHaveAttribute('data-frozen','true',{timeout:4000});await expect(b.locator('.player-label[data-frozen="true"]')).toBeVisible();
 const before=await localPose(a);await a.keyboard.down('d');await a.waitForTimeout(350);await a.keyboard.up('d');const after=await localPose(a);expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeLessThan(.1);
 const freezeRoom=latest(bf),hider=freezeRoom.players.find(p=>p.role==='hider')!,seeker=freezeRoom.players.find(p=>p.role==='seeker')!;expect(groundBeamStrength(hider,seeker,-.055)).toBeGreaterThan(.05);expect(hider.immunityUntil!-hider.frozenUntil!).toBe(5000);
 await turn(b,'s');await expect(a.locator('canvas')).toHaveAttribute('data-frozen','false',{timeout:3000});
 await b.reload();await b.locator('canvas[data-ready="true"]').waitFor();await expect(b.locator('canvas')).toHaveAttribute('data-role','seeker');await expect(b.locator('canvas')).toHaveAttribute('data-round-phase','seeking');
 await Promise.all([humanClues,soloClues]);if(watcherErrors.length)throw watcherErrors[0];
 for(const frames of [bf,sf]){
  const snapshots=rooms(frames).filter(r=>r.round&&r.round.phase!=='reveal');
  expect(snapshots.every(r=>!('capsuleSpotId' in r.round!)&&!('clueOffer' in r.round!)&&!('decoysRemaining' in r.round!))).toBe(true);
  const markSchemas=new Set(snapshots.flatMap(r=>(r.round!.marks??[]).map(mark=>Object.keys(mark).sort().join(','))));
  const footSchemas=new Set(snapshots.flatMap(r=>(r.round!.footprints??[]).map(foot=>Object.keys(foot).sort().join(','))));
  expect([...markSchemas]).toEqual(['createdAt,id,x,z']);expect([...footSchemas]).toEqual(['expiresAt,facing,fadeAt,id,x,z']);
 }
 // Human clue choices (including an unanswered offer) and the solo automatic clues must all be true without uniquely identifying a spot.
 for(const [frames,knownId] of [[bf,'mailbox-2'],[sf,undefined]] as const){
  if(!knownId)await expect(solo.locator('canvas')).toHaveAttribute('data-round-phase','reveal',{timeout:35000});
  const room=latest(frames),id=knownId??room.round!.capsuleSpotId!,capsule=HIDING_SPOTS.find(s=>s.id===id)!;
  const pool=trueCluePool(capsule),clues=room.round!.clues!;expect(clues).toHaveLength(3);let candidates=HIDING_SPOTS.map(s=>s.id);
  for(const clue of clues){const truth=pool.find(item=>item.text===clue.text);expect(truth).toBeDefined();expect(truth!.candidates).toContain(id);candidates=candidates.filter(candidate=>truth!.candidates.includes(candidate));}
  expect(candidates.length).toBeGreaterThanOrEqual(2);
 }
 expect(errors).toEqual([]);

 // Play another solo round to a real find, using only the public clue and unlabelled marks.
 await expect(solo.locator('#next-round')).toBeEnabled({timeout:6000});await solo.locator('#next-round').click();await pickUpFlashlight(solo);await seeking(solo);
 await expect.poll(()=>latest(sf).round?.clues?.length??0,{timeout:35000}).toBe(1);
 const publicRound=latest(sf).round!,text=publicRound.clues![0].text;
 const truth=HIDING_SPOTS.flatMap(candidate=>trueCluePool(candidate)).find(clue=>clue.text===text)!;
 const candidates=HIDING_SPOTS.filter(candidate=>truth.candidates.includes(candidate.id)&&publicRound.marks!.some(mark=>Math.hypot(mark.x-candidate.x,mark.z-candidate.z)<.05));
 let found=false;
 while(candidates.length){const here=await localPose(solo);candidates.sort((a,b)=>Math.hypot(a.x-here.x,a.z-here.z)-Math.hypot(b.x-here.x,b.z-here.z));const candidate=candidates.shift()!;
  await walkAxis(solo,'z',-5.8);await walkAxis(solo,'x',candidate.x);await walkAxis(solo,'z',candidate.z+2);await turn(solo,'w');
  await expect.poll(async()=>Number(await solo.locator('canvas').getAttribute('data-marks-visible'))).toBeGreaterThan(0);
  await walkAxis(solo,'z',candidate.z+.8);await expect(solo.locator('#round-action')).toContainText('Search',{timeout:6000});await solo.keyboard.down('e');await solo.waitForTimeout(2250);await solo.keyboard.up('e');
  if(latest(sf).round?.phase==='reveal'){found=true;break;}
 }
 expect(found).toBe(true);await expect(solo.locator('#round-instruction')).toContainText('Robin found it');await solo.screenshot({path:'../design/step5-solo-found-phone.png'});
 }finally{await Promise.allSettled([phone.close(),laptop.close(),soloContext.close()]);}
});
