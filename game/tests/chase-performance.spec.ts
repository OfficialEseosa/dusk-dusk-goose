import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';

test('records live frame timing without debugger or GPU readback',async({browser})=>{
  test.setTimeout(90000);const reports=[];
  for(const size of [{width:667,height:375},{width:1366,height:768}]){
    const context=await browser.newContext({viewport:size,hasTouch:size.width===667});
    await context.addInitScript(()=>{
      const native=requestAnimationFrame.bind(window);let previous=0;
      const samples:number[]=[],work:number[]=[];(window as any).__frames={samples,work};
      window.requestAnimationFrame=callback=>native(time=>{const start=performance.now();callback(time);if(previous&&samples.length<7200){samples.push(time-previous);work.push(performance.now()-start);}previous=time;});
    });
    try{
      const page=await context.newPage(),observed=watchChase(page);await page.goto('/');
      await expect(page.locator('canvas')).toHaveAttribute('aria-busy','false');await page.waitForTimeout(4000);
      await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>observed.snapshot?.phase).toBe('playing');
      await page.evaluate(()=>{(window as any).__frames.samples.length=0;(window as any).__frames.work.length=0;});
      await page.waitForTimeout(20000);
      const metrics=await page.evaluate(()=>{const {samples,work}=(window as any).__frames as {samples:number[];work:number[]};const sorted=[...samples].sort((a,b)=>a-b),average=samples.reduce((a,b)=>a+b,0)/samples.length,canvas=document.querySelector('canvas')!;return {frames:samples.length,averageMs:average,fps:1000/average,p99Ms:sorted[Math.floor(sorted.length*.99)],worstMs:sorted.at(-1),averageCallbackMs:work.reduce((a,b)=>a+b,0)/work.length,backbuffer:{width:canvas.width,height:canvas.height},viewport:{width:innerWidth,height:innerHeight},dpr:devicePixelRatio};});
      const renderer=await page.evaluate(()=>{const gl=document.querySelector('canvas')!.getContext('webgl2')!,debug=gl.getExtension('WEBGL_debug_renderer_info');return debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'unavailable';});
      expect(metrics.frames).toBeGreaterThan(100);expect(observed.errors).toEqual([]);
      reports.push({...metrics,renderer,size,corrections:observed.corrections,errors:observed.errors,physicalPhone:false,debugger:false,gpuReadback:false});
    }finally{await context.close();}
  }
  await mkdir('evidence/phase6',{recursive:true});await writeFile('evidence/phase6/frame-timing.json',JSON.stringify(reports,null,2));
});
