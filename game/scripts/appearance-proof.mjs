// Local evidence driver only. The visual fixtures call the real renderer;
// the separate solo run uses real keyboard input and the untouched server rules.
import {chromium} from '@playwright/test';
import {createChaseServer} from '../dist/server/server/chase-server.js';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const stage=process.argv[2];if(!['before','after'].includes(stage))throw Error('Pass before or after');
const directory=`evidence/appearance-fix/${stage}`;await mkdir(directory,{recursive:true});
const game=createChaseServer({clientDir:resolve('dist/client')});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${game.server.address().port}`;
const browser=await chromium.launch({args:['--use-angle=d3d11','--force-high-performance-gpu','--force_high_performance_gpu']});
const reports=[];
async function capture(page,name){const session=await page.context().newCDPSession(page);try{const r=await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});await writeFile(`${directory}/${name}.png`,Buffer.from(r.data,'base64'));}finally{await session.detach();}}
try{
 for(const viewport of [{width:667,height:375},{width:1366,height:768}]){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await context.newCDPSession(page);let script='';cdp.on('Debugger.scriptParsed',s=>{if(/\/assets\/index-.*\.js$/.test(s.url))script=s.scriptId;});await cdp.send('Debugger.enable');
  await page.goto(url);await page.locator('canvas[aria-busy="false"]').waitFor();
  const source=(await cdp.send('Debugger.getScriptSource',{scriptId:script})).scriptSource,at=source.lastIndexOf('this.renderer.render(this.scene,this.camera)'),prefix=source.slice(0,at);
  const bp=await cdp.send('Debugger.setBreakpoint',{location:{scriptId:script,lineNumber:prefix.split('\n').length-1,columnNumber:at-prefix.lastIndexOf('\n')-1},condition:'(window.__proofView=this,false)'});
  await page.waitForFunction(()=>!!window.__proofView);await cdp.send('Debugger.removeBreakpoint',{breakpointId:bp.breakpointId});await cdp.send('Debugger.disable');
  await page.evaluate(()=>{window.__proofSamples=[];const sample=()=>{const v=window.__proofView,mode=window.__proofMode??'title',kids=[];for(const [id,f] of v.figures){if(f.role!=='kid')continue;const point=f.root.position.clone();f.torchLens?.getWorldPosition(point);const q=f.root.quaternion.clone();f.torchLens?.getWorldQuaternion(q);const forward=f.root.position.clone().set(0,-1,0).applyQuaternion(q),beam=f.root.position.clone().set(0,0,1).applyQuaternion(f.beam.quaternion);kids.push({id,lit:f.beam.visible,yaw:f.root.rotation.y,beamYaw:f.beam.rotation.y,lensGap:f.torchLens?point.distanceTo(f.beam.position):null,axisDot:f.torchLens?forward.dot(beam):null,legs:f.legBones?.map(({bone})=>[bone.rotation.x,bone.rotation.z])});}const g=v.figures.get('proof-goose');window.__proofSamples.push({at:performance.now(),mode,kids,wing:g?.wings[0].rotation.z,wingSpread:g?.wings[0].rotation.y,neck:g?.neck.rotation.x,leg:g?.legs[0].rotation.x});if(window.__proofSamples.length>1200)window.__proofSamples.shift();requestAnimationFrame(sample);};requestAnimationFrame(sample);});
  await page.waitForTimeout(700);await capture(page,`title-${viewport.width}`);
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.locator('#hud').waitFor();await page.waitForTimeout(2200);
  const room=[...game.rooms.values()].at(-1);for(const e of room.sim.entities)e.safeUntil=500;
  const protect=setInterval(()=>{for(const e of room.sim.entities)e.safeUntil=500;},50);
  await page.evaluate(()=>{
   const v=window.__proofView,render=v.render.bind(v);
   v.render=(now,snapshot,id,local,position,color)=>{
    if(!snapshot)return render(now,snapshot,id,local,position,color);
    const s=structuredClone(snapshot),base=s.entities.find(e=>e.id===id),mode=window.__proofMode??'kid-side';
    const kid={...base,id,role:'kid',x:0,z:6.8,light:mode!=='goose-walk'&&mode!=='goose-lunge'&&mode!=='goose-frozen',battery:100,frozenUntil:0,safeUntil:0,held:true,aim:Math.PI/2,facing:-Math.PI/2,vx:-2,vz:0};
    const goose={...base,id:'proof-goose',role:'goose',x:4,z:6.8,light:false,held:false,facing:-Math.PI/2,aim:-Math.PI/2,vx:-1,vz:0,safeUntil:0,frozenUntil:0,immuneUntil:0,lungeAt:-100};
    if(mode==='kid-strafe'){kid.facing=0;kid.vx=0;kid.vz=2;}
    if(mode==='kid-front'){kid.z=5.8;kid.aim=Math.PI; kid.facing=0;kid.vx=0;kid.vz=2;goose.x=0;goose.z=4.4;}
    const travel=(now-(window.__proofModeAt??now))/1000;
    if(mode.startsWith('kid')){kid.x+=kid.vx*travel;kid.z+=kid.vz*travel;}
    else{kid.x=-1.8;goose.x=-.8+travel*.4;goose.z=6.6;goose.facing=Math.PI/2;goose.vx=.4;}
    if(mode==='goose-lunge')goose.lungeAt=s.now-(.12+((now-window.__proofModeAt)/1000)%.22);
    if(mode==='goose-frozen'){goose.frozenUntil=s.now+1;goose.vx=0;}
    s.entities=[kid,goose];if(window.__proofShared){s.entities.push({...kid,id:'proof-remote',x:-3,z:5.8,bot:false},{...kid,id:'proof-bot',x:2,z:5.8,bot:true});}s.events=[];s.phase='playing';
    render(now,s,id,{x:kid.x,z:kid.z},e=>e,color);
    window.__proofArgs={kid,goose,now,simNow:s.now};
   };
  });
  const metrics=[];
  for(const mode of ['kid-side','kid-front',...(stage==='after'?['kid-strafe']:[]),'goose-walk','goose-lunge','goose-frozen','goose-lit']){
   await page.evaluate(mode=>{window.__proofMode=mode;window.__proofModeAt=performance.now();},mode);await page.waitForTimeout(900);
   await capture(page,`${mode}-${viewport.width}`);
   metrics.push(await page.evaluate(mode=>{const v=window.__proofView,a=window.__proofArgs,f=v.figures.get(a.kid.id),g=v.figures.get('proof-goose'),torch=f.torchLens??f.body.getObjectByName('proof-nonexistent');const p=f.root.position.clone();torch?.getWorldPosition(p);return {mode,kidFacing:f.root.rotation.y,aim:a.kid.aim,movementFacing:a.kid.facing,velocity:[a.kid.vx,a.kid.vz],movementDotBeam:a.kid.vx*Math.sin(f.root.rotation.y)+a.kid.vz*Math.cos(f.root.rotation.y),beamOrigin:f.beam.position.toArray(),lensOrigin:torch?p.toArray():null,neck:g.neck.rotation.x,wings:g.wings.map(w=>w.rotation.z),legs:g.legs.map(l=>l.rotation.x)};},mode));
  }
  await page.evaluate(()=>{window.__proofMode='shared-kids';window.__proofShared=true;});await page.waitForTimeout(800);
  const samples=await page.evaluate(()=>window.__proofSamples);const kids=samples.flatMap(s=>s.kids).filter(k=>k.lit&&k.lensGap!==null),lensGap=Math.max(...kids.map(k=>k.lensGap)),minAxisDot=Math.min(...kids.map(k=>k.axisDot)),beamYawGap=Math.max(...kids.map(k=>Math.abs(Math.atan2(Math.sin(k.yaw-k.beamYaw),Math.cos(k.yaw-k.beamYaw)))));
  const range=(mode,key)=>{const a=samples.filter(s=>s.mode===mode&&typeof s[key]==='number').map(s=>s[key]);return a.length?Math.max(...a)-Math.min(...a):null;};
  const motion={lensGap,minAxisDot,beamYawGap,wingFlapRange:range('goose-lunge','wing'),waddleRange:range('goose-walk','neck'),footRange:range('goose-walk','leg'),sharedKidCount:Math.max(...samples.filter(s=>s.mode==='shared-kids').map(s=>s.kids.length))};
  if(stage==='after'&&metrics.filter(m=>['kid-side','kid-front'].includes(m.mode)).some(m=>m.movementDotBeam> -1.9))throw Error('Kid is not moving away from its beam');
  const previous=new Map();let maxTurnStep=0;for(const frame of samples)for(const kid of frame.kids){if(previous.has(kid.id))maxTurnStep=Math.max(maxTurnStep,Math.abs(Math.atan2(Math.sin(kid.yaw-previous.get(kid.id)),Math.cos(kid.yaw-previous.get(kid.id)))));previous.set(kid.id,kid.yaw);}
  motion.maxTurnStep=maxTurnStep;motion.footwork={};for(const mode of ['kid-side','kid-front','kid-strafe']){const feet=samples.filter(s=>s.mode===mode).flatMap(s=>s.kids).flatMap(k=>k.legs??[]);motion.footwork[mode]={forwardSwing:feet.length?Math.max(...feet.map(f=>f[0]))-Math.min(...feet.map(f=>f[0])):null,sideSwing:feet.length?Math.max(...feet.map(f=>f[1]))-Math.min(...feet.map(f=>f[1])):null};}
  if(stage==='after'&&maxTurnStep>Math.PI/10+1e-6)throw Error(`Turn jumped ${maxTurnStep} radians`);
  if(stage==='after'&&(lensGap>1e-6||beamYawGap>1e-6||minAxisDot<.995))throw Error(`Hand/beam mismatch: ${JSON.stringify({lensGap,beamYawGap,minAxisDot})}`);
  clearInterval(protect);await context.close();reports.push({viewport,fixtureDriven:true,metrics,motion,errors});
 }
 // A normal solo run: hold LIGHT as a first-time player would, no fixture or protected seat.
 const context=await browser.newContext({viewport:{width:667,height:375}}),page=await context.newPage();
 await page.goto(url);await page.locator('canvas[aria-busy="false"]').waitFor();await page.getByRole('button',{name:'Play',exact:true}).click();await page.locator('#hud').waitFor();
 const room=[...game.rooms.values()].at(-1),started=Date.now();await page.waitForTimeout(3000);await page.keyboard.down('Space');
 let twentySecondCapture=false;
 while(room.sim.phase!=='results'&&Date.now()-started<40000){if(!twentySecondCapture&&room.sim.elapsed>=20){await capture(page,'solo-20-seconds-667');twentySecondCapture=true;}await page.waitForTimeout(50);}
 await capture(page,'solo-caught-667');reports.push({realSolo:true,lightHeldAtSeconds:3,elapsed:room.sim.elapsed,phase:room.sim.phase,freezes:room.sim.events.filter(e=>e.type==='freeze').map(e=>e.at),twentySecondCapture,wallMs:Date.now()-started});await context.close();
 await writeFile(`${directory}/metrics.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.at(-1)));
}finally{await browser.close();await game.close();}
