import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';
import {captureFrame} from './chase-capture';

// Read-only CDP instrumentation lives in the test, with no production debug API.
test('kit animation, goose waddle and phone character size are visible in the rendered scene',async({browser})=>{
  test.setTimeout(60000);const evidence=process.env.DDG_ART_EVIDENCE_DIR??'test-results/art';await mkdir(evidence,{recursive:true});const reports=[];
  for(const viewport of [{width:667,height:375},{width:1366,height:768}]){
    const context=await browser.newContext({viewport}),page=await context.newPage(),state=watchChase(page),cdp=await context.newCDPSession(page);let script='';
    cdp.on('Debugger.scriptParsed',s=>{if(/\/assets\/index-.*\.js$/.test(s.url))script=s.scriptId;});await cdp.send('Debugger.enable');
    await page.addInitScript(()=>{const samples:any[]=[],heights=new Map<string,number>();(window as any).__artSamples=samples;(window as any).__recordArt=(view:any)=>{
      if(!view.figures||samples.length>=180)return;const figures:any[]=[];
      // Full skinned-vertex projection is expensive under a debugger. Sample it
      // every fifth frame; lightweight animation/event measurements stay per-frame.
      for(const [id,f] of view.figures){if(samples.length%5===0||!heights.has(id)){let top=Infinity,bottom=-Infinity;const p=f.root.position.clone();f.body.traverse((node:any)=>{if(!node.isMesh)return;for(let i=0;i<node.geometry.attributes.position.count;i++){node.getVertexPosition(i,p);p.applyMatrix4(node.matrixWorld).project(view.camera);const y=(1-p.y)*innerHeight/2;top=Math.min(top,y);bottom=Math.max(bottom,y);}});heights.set(id,bottom-top);}
        figures.push({id,role:f.role,height:heights.get(id),mixer:f.mixer?.time??0,phase:f.phase,neck:f.neck?.rotation.x??0,runWeight:f.run?.getEffectiveWeight()??0,ice:f.ice?.visible??false,freezeRing:f.ice?.children[1]?.geometry.drawRange.count??0,tell:f.tell?.visible??false,scale:f.root.scale.x,hitStop:(f.holdUntil??0)>performance.now(),bodyY:f.body.scale.y});}
      samples.push({at:performance.now(),wall:Date.now(),figures,particles:view.effects?Array.from(view.effects.life).filter((n:any)=>n>0).length:0,pool:view.effects?.life.length??0,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,programs:view.renderer.info.programs.length});};
    });
    try{
      await page.goto('/');await expect(page.locator('canvas')).toHaveAttribute('aria-busy','false');await expect.poll(()=>script).toBeTruthy();
      const source=(await cdp.send('Debugger.getScriptSource',{scriptId:script})).scriptSource,needle='this.renderer.render(this.scene,this.camera)',at=source.lastIndexOf(needle);expect(at).toBeGreaterThan(0);
      const before=source.slice(0,at),lineNumber=before.split('\n').length-1,columnNumber=at-before.lastIndexOf('\n')-1;
      // Capture the renderer once, then remove the debugger from the frame loop.
      // The page-local RAF probe runs after the game updates world/bone matrices.
      const breakpoint=await cdp.send('Debugger.setBreakpoint',{location:{scriptId:script,lineNumber,columnNumber},condition:'(window.__artView=this,false)'});
      await expect.poll(()=>page.evaluate(()=>!!(window as any).__artView?.figures)).toBe(true);
      await cdp.send('Debugger.removeBreakpoint',{breakpointId:breakpoint.breakpointId});
      await cdp.send('Debugger.disable');
      await page.evaluate(()=>{(window as any).__artProbeOn=true;const sample=()=>{if(!(window as any).__artProbeOn)return;(window as any).__recordArt((window as any).__artView);requestAnimationFrame(sample);};requestAnimationFrame(sample);});
      try{await expect.poll(()=>page.evaluate(()=>(window as any).__artSamples.length)).toBeGreaterThan(30);}catch(error){console.log(JSON.stringify({requested:{lineNumber,columnNumber},actual:breakpoint.actualLocation,errors:state.errors,source:source.slice(at-100,at+100)}));throw error;}
      await captureFrame(page,`${evidence}/title-${viewport.width}.png`);
      const controls=await page.locator('#title input,#title button').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height,font:parseFloat(getComputedStyle(node).fontSize)};}));
      for(const b of controls){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(viewport.width);expect(b.bottom).toBeLessThanOrEqual(viewport.height);expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);expect(b.font).toBeGreaterThanOrEqual(16);}
      const title=await page.evaluate(()=>(window as any).__artSamples);const kidTimes=title.flatMap((s:any)=>s.figures.filter((f:any)=>f.role==='kid').map((f:any)=>f.mixer));expect(Math.max(...kidTimes)-Math.min(...kidTimes)).toBeGreaterThan(.3);
      const necks=title.flatMap((s:any)=>s.figures.filter((f:any)=>f.role==='goose').map((f:any)=>f.neck));expect(Math.max(...necks)-Math.min(...necks)).toBeGreaterThan(.05);
      await page.evaluate(()=>{(window as any).__artSamples.length=0;});await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>state.id).toBeTruthy();await expect(page.locator('#role-card')).toBeVisible();const roleBox=await page.locator('#role-card').boundingBox();expect(roleBox).toBeTruthy();expect(roleBox!.x).toBeGreaterThanOrEqual(145);expect(roleBox!.x+roleBox!.width).toBeLessThanOrEqual(viewport.width-145);expect(roleBox!.y+roleBox!.height).toBeLessThanOrEqual(viewport.height-140);await captureFrame(page,`${evidence}/role-${viewport.width}.png`);
      await expect.poll(()=>page.evaluate(id=>(window as any).__artSamples.some((s:any)=>s.figures.some((f:any)=>f.id===id)),state.id)).toBe(true);
      const play=await page.evaluate(()=>(window as any).__artSamples),heights=play.flatMap((s:any)=>s.figures.filter((f:any)=>f.id===state.id&&f.role==='kid').map((f:any)=>f.height));expect(heights.length).toBeGreaterThan(0);if(viewport.width===667)expect(Math.min(...heights)).toBeGreaterThanOrEqual(56);
      const layout=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,w:innerWidth,sh:document.documentElement.scrollHeight,h:innerHeight}));expect(layout.sw).toBe(layout.w);expect(layout.sh).toBe(layout.h);expect(state.errors).toEqual([]);
      reports.push({viewport,minKidPixels:Math.min(...heights),maxCalls:Math.max(...title.map((s:any)=>s.calls)),maxTriangles:Math.max(...title.map((s:any)=>s.triangles)),maxPrograms:Math.max(...title.map((s:any)=>s.programs)),kidAnimationSeconds:Math.max(...kidTimes)-Math.min(...kidTimes),gooseNeckRange:Math.max(...necks)-Math.min(...necks),errors:state.errors});
      // Also measure actual event effects, rather than inferring motion from stills.
      await expect.poll(()=>{const s=state.snapshot,k=s?.entities.find(e=>e.id===state.id),g=s?.entities.find(e=>e.role==='goose');return k&&g?Math.hypot(k.x-g.x,k.z-g.z):100;},{timeout:5000}).toBeLessThan(8.7);
      await page.evaluate(()=>{(window as any).__artSamples.length=0;});await page.keyboard.down('Space');await expect.poll(()=>state.snapshot?.events.some(e=>e.type==='freeze'&&e.actor===state.id),{timeout:3000}).toBe(true);
      try{await expect.poll(()=>page.evaluate(()=>(window as any).__artSamples.some((s:any)=>s.figures.some((f:any)=>f.ice)))).toBe(true);}catch(error){console.log(JSON.stringify({viewport,errors:state.errors,snapshot:state.snapshot,lastInput:state.lastInput,samples:await page.evaluate(()=>(window as any).__artSamples.slice(-3))}));throw error;}await captureFrame(page,`${evidence}/ice-${viewport.width}.png`);await page.keyboard.up('Space');
      await expect.poll(()=>page.evaluate(()=>(window as any).__artSamples.filter((s:any)=>s.figures.some((f:any)=>f.ice&&f.freezeRing>0&&f.freezeRing<180)).length),{timeout:2000}).toBeGreaterThan(0);
      const frames:{at:number;data:string}[]=[];cdp.on('Page.screencastFrame',frame=>{frames.push({at:(frame.metadata.timestamp??Date.now()/1000)*1000,data:frame.data});if(frames.length>40)frames.shift();void cdp.send('Page.screencastFrameAck',{sessionId:frame.sessionId}).catch(()=>{});});await cdp.send('Page.startScreencast',{format:'png',everyNthFrame:1});
      await page.evaluate(()=>{(window as any).__artSamples.length=0;});await expect.poll(()=>state.snapshot?.phase,{timeout:15000}).toBe('results');await expect.poll(()=>page.evaluate(id=>(window as any).__artSamples.some((s:any)=>s.figures.some((f:any)=>f.id===id&&f.role==='goose')),state.id)).toBe(true);await expect.poll(()=>frames.length).toBeGreaterThan(2);const resultAt=state.runTimes[state.snapshot!.solo!.runId].results!,firstGoose=await page.evaluate(id=>(window as any).__artSamples.find((s:any)=>s.figures.some((f:any)=>f.id===id&&f.role==='goose'&&f.scale<1))?.wall,state.id);expect(firstGoose).toBeTruthy();await expect.poll(()=>frames.some(f=>f.at>=firstGoose+80),{timeout:2000,intervals:[25,50]}).toBe(true);await cdp.send('Page.stopScreencast');const conversionFrame=[...frames].filter(f=>f.at>=firstGoose+80).sort((a,b)=>Math.abs(a.at-firstGoose-100)-Math.abs(b.at-firstGoose-100))[0];expect(conversionFrame).toBeTruthy();expect(conversionFrame.at-resultAt).toBeLessThan(550);await writeFile(`${evidence}/conversion-${viewport.width}.png`,Buffer.from(conversionFrame.data,'base64'));
      const effectSamples=await page.evaluate(()=>(window as any).__artSamples),own=effectSamples.flatMap((s:any)=>s.figures.filter((f:any)=>f.id===state.id));expect(own.some((f:any)=>f.hitStop)).toBe(true);expect(own.some((f:any)=>f.role==='goose'&&f.scale<1)).toBe(true);expect(Math.max(...effectSamples.map((s:any)=>s.particles))).toBeGreaterThan(20);expect(effectSamples.every((s:any)=>s.pool===256&&s.particles<=256)).toBe(true);
      Object.assign(reports.at(-1)!,{catchFrameAfterResultMs:conversionFrame.at-resultAt,catchFrameAfterRenderedGooseMs:conversionFrame.at-firstGoose,freezeRingDrained:true,catchHitStopObserved:true,conversionPopObserved:true,maxActiveParticles:Math.max(...effectSamples.map((s:any)=>s.particles)),particleCapacity:256});expect(state.errors).toEqual([]);
      await page.evaluate(()=>{(window as any).__artProbeOn=false;delete (window as any).__artView;});
    }finally{await context.close();}
  }
  await writeFile(`${evidence}/render-metrics.json`,JSON.stringify(reports,null,2));
});
