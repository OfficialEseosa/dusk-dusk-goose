import {chromium} from '@playwright/test';
import {createChaseServer} from '../dist/server/server/chase-server.js';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const game=createChaseServer({clientDir:resolve('dist/client')});
await new Promise(r=>game.server.listen(0,'127.0.0.1',r));
const extraArgs=JSON.parse(process.env.DDG_GPU_ARGS??'[]');
if(!Array.isArray(extraArgs)||extraArgs.some(arg=>typeof arg!=='string'))throw new Error('Invalid GPU arguments');
const launchArgs=[...(process.platform==='win32'?['--use-angle=d3d11']:[]),...extraArgs];
const browser=await chromium.launch({args:launchArgs}),reports=[];
try{
  for(const viewport of [{width:667,height:375},{width:1366,height:768}]){
    const context=await browser.newContext({viewport,hasTouch:viewport.width===667}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      const native=requestAnimationFrame.bind(window),state=window.__gpuProfile={recording:false,frames:[],gpu:[],supported:null,disjoint:0};
      let gl,ext,previous=0;const free=[],pending=[];
      setInterval(()=>{if(!gl||!ext)return;const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);if(disjoint)state.disjoint++;
        while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){const q=pending.shift();if(!disjoint)state.gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);free.push(q);}},100);
      window.requestAnimationFrame=callback=>native(time=>{
        let query;const recording=state.recording;
        if(recording){if(!gl){gl=document.querySelector('canvas')?.getContext('webgl2');if(gl){ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');state.supported=!!ext;if(ext)for(let i=0;i<8;i++)free.push(gl.createQuery());}}
          if(ext&&free.length){query=free.pop();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}}
        const start=performance.now();try{callback(time);}finally{if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push(query);}if(recording){if(previous)state.frames.push({at:time,ms:time-previous,callbackMs:performance.now()-start});previous=time;}}
      });
    });
    try{
      await page.goto(`http://127.0.0.1:${game.server.address().port}`);await page.locator('canvas[aria-busy="false"]').waitFor();await page.waitForTimeout(4000);
      await page.getByRole('button',{name:'Play',exact:true}).click();await page.locator('#hud').waitFor();await page.evaluate(()=>window.__gpuProfile.recording=true);await page.waitForTimeout(20000);
      const metrics=await page.evaluate(()=>{const s=window.__gpuProfile;s.recording=false;const summarize=a=>{const sorted=[...a].sort((x,y)=>x-y);return {count:a.length,meanMs:a.reduce((x,y)=>x+y,0)/a.length,medianMs:sorted[Math.floor(a.length*.5)],p99Ms:sorted[Math.floor(a.length*.99)],worstMs:sorted.at(-1)};};const start=s.frames[0]?.at??0,gl=document.querySelector('canvas').getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return {supported:s.supported,disjoint:s.disjoint,gpu:summarize(s.gpu),frames:summarize(s.frames.map(f=>f.ms)),callback:summarize(s.frames.map(f=>f.callbackMs)),first5s:summarize(s.frames.filter(f=>f.at-start<5000).map(f=>f.ms)),after5s:summarize(s.frames.filter(f=>f.at-start>=5000).map(f=>f.ms)),renderer:debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'unknown',webglError:gl.getError()};});
      reports.push({viewport,...metrics,errors,launchArgs,browser:browser.version(),physicalPhone:false,debugger:false,pixelReadback:false,nonblockingGpuQueries:true});console.log(JSON.stringify({viewport,renderer:metrics.renderer,supported:metrics.supported,gpu:metrics.gpu,frames:metrics.frames,errors}));
    }finally{await context.close();}
  }
  await mkdir('evidence/phase7',{recursive:true});await writeFile('evidence/phase7/gpu-profile.json',JSON.stringify(reports,null,2));
}finally{await browser.close();await game.close();}
