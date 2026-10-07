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
    await page.addInitScript(()=>{const samples:any[]=[];(window as any).__artSamples=samples;(window as any).__recordArt=(view:any)=>{
      if(!view.figures||samples.length>=180)return;const figures:any[]=[];
      for(const [id,f] of view.figures){let top=Infinity,bottom=-Infinity;const p=f.root.position.clone();f.body.traverse((node:any)=>{if(!node.isMesh)return;for(let i=0;i<node.geometry.attributes.position.count;i++){node.getVertexPosition(i,p);p.applyMatrix4(node.matrixWorld).project(view.camera);const y=(1-p.y)*innerHeight/2;top=Math.min(top,y);bottom=Math.max(bottom,y);}});
        figures.push({id,role:f.role,height:bottom-top,mixer:f.mixer?.time??0,phase:f.phase,neck:f.neck?.rotation.x??0,runWeight:f.run?.getEffectiveWeight()??0});}
      samples.push({at:performance.now(),figures,calls:view.renderer.info.render.calls,triangles:view.renderer.info.render.triangles,programs:view.renderer.info.programs.length});};
    });
    try{
      await page.goto('/');await expect(page.locator('canvas')).toHaveAttribute('aria-busy','false');await expect.poll(()=>script).toBeTruthy();
      const source=(await cdp.send('Debugger.getScriptSource',{scriptId:script})).scriptSource,needle='this.renderer.render(this.scene,this.camera)',at=source.lastIndexOf(needle);expect(at).toBeGreaterThan(0);
      const before=source.slice(0,at),lineNumber=before.split('\n').length-1,columnNumber=at-before.lastIndexOf('\n')-1;
      // Read after rendering has updated the new figure's world/bone matrices.
      const breakpoint=await cdp.send('Debugger.setBreakpoint',{location:{scriptId:script,lineNumber,columnNumber},condition:'(requestAnimationFrame(()=>window.__recordArt(this)),false)'});
      await expect.poll(()=>page.evaluate(()=>(window as any).__artSamples.length)).toBeGreaterThan(30);
      await captureFrame(page,`${evidence}/title-${viewport.width}.png`);
      const controls=await page.locator('#title input,#title button').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height,font:parseFloat(getComputedStyle(node).fontSize)};}));
      for(const b of controls){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(viewport.width);expect(b.bottom).toBeLessThanOrEqual(viewport.height);expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);expect(b.font).toBeGreaterThanOrEqual(16);}
      const title=await page.evaluate(()=>(window as any).__artSamples);const kidTimes=title.flatMap((s:any)=>s.figures.filter((f:any)=>f.role==='kid').map((f:any)=>f.mixer));expect(Math.max(...kidTimes)-Math.min(...kidTimes)).toBeGreaterThan(.3);
      const necks=title.flatMap((s:any)=>s.figures.filter((f:any)=>f.role==='goose').map((f:any)=>f.neck));expect(Math.max(...necks)-Math.min(...necks)).toBeGreaterThan(.05);
      await page.evaluate(()=>{(window as any).__artSamples.length=0;});await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>state.id).toBeTruthy();
      await expect.poll(()=>page.evaluate(id=>(window as any).__artSamples.some((s:any)=>s.figures.some((f:any)=>f.id===id)),state.id)).toBe(true);
      const play=await page.evaluate(()=>(window as any).__artSamples),heights=play.flatMap((s:any)=>s.figures.filter((f:any)=>f.id===state.id&&f.role==='kid').map((f:any)=>f.height));expect(heights.length).toBeGreaterThan(0);if(viewport.width===667)expect(Math.min(...heights)).toBeGreaterThanOrEqual(56);
      const layout=await page.evaluate(()=>({sw:document.documentElement.scrollWidth,w:innerWidth,sh:document.documentElement.scrollHeight,h:innerHeight}));expect(layout.sw).toBe(layout.w);expect(layout.sh).toBe(layout.h);expect(state.errors).toEqual([]);
      reports.push({viewport,minKidPixels:Math.min(...heights),maxCalls:Math.max(...title.map((s:any)=>s.calls)),maxTriangles:Math.max(...title.map((s:any)=>s.triangles)),maxPrograms:Math.max(...title.map((s:any)=>s.programs)),kidAnimationSeconds:Math.max(...kidTimes)-Math.min(...kidTimes),gooseNeckRange:Math.max(...necks)-Math.min(...necks),errors:state.errors});
      await cdp.send('Debugger.removeBreakpoint',{breakpointId:breakpoint.breakpointId});
    }finally{await context.close();}
  }
  await writeFile(`${evidence}/render-metrics.json`,JSON.stringify(reports,null,2));
});
