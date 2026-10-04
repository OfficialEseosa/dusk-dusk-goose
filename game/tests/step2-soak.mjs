import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';

const browser = await chromium.launch({args:process.platform==='win32'?['--use-angle=d3d11']:[]});
const contexts = await Promise.all([{width:667,height:375},{width:1366,height:768}].map(viewport=>browser.newContext({viewport})));
const pages = await Promise.all(contexts.map(c=>c.newPage()));
const result={hardware:{platform:os.platform(),cpu:os.cpus()[0]?.model,browser:browser.version()},durationMs:0,disconnects:0,errors:[],samples:[]};
for(const p of pages){p.on('pageerror',e=>result.errors.push(e.message));p.on('websocket',ws=>ws.on('close',()=>result.disconnects++));}
try {
  const [a,b]=pages;
  await a.goto('http://localhost:5174/');
  await a.getByLabel('Your name').fill('Alex');await a.getByRole('button',{name:'Create a night',exact:true}).click();
  await a.getByTestId('room-code').waitFor();const code=await a.getByTestId('room-code').innerText();
  await b.goto(`http://localhost:5174/?room=${code}`);await b.getByLabel('Your name').fill('Sam');await b.getByRole('button',{name:'Join',exact:true}).click();
  await b.getByRole('list',{name:'Players'}).waitFor();await a.getByRole('button',{name:'Start the night',exact:true}).click();
  for(const p of pages){await p.locator('canvas[data-ready="true"]').waitFor();await p.evaluate(()=>window.soakStick=document.querySelector('#move-stick'));}
  result.hardware.gpu=await a.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable';});
  const start=Date.now();
  while(Date.now()-start<600000){
    await new Promise(resolve=>setTimeout(resolve,10000));
    const sample=await Promise.all(pages.map(p=>p.evaluate(()=>({fps:Number(document.querySelector('canvas').dataset.fps),p95:Number(document.querySelector('canvas').dataset.frameP95),frames:Number(document.querySelector('canvas').dataset.sampleFrames),triangles:Number(document.querySelector('canvas').dataset.triangles),drawCalls:Number(document.querySelector('canvas').dataset.drawCalls),players:document.querySelector('#street-players').textContent,stable:window.soakStick===document.querySelector('#move-stick'),status:document.querySelector('#street-status').textContent,lit:document.querySelector('canvas').dataset.lit,poses:JSON.parse(document.querySelector('canvas').dataset.playerposes)}))));
    result.samples.push({elapsed:Date.now()-start,devices:sample});
    if(sample.some(s=>!s.stable||s.status||Object.keys(s.poses).length!==2||s.players.includes('Reconnecting')))throw new Error('Soak state failed: '+JSON.stringify(sample));
    if(result.samples.length%6===0)console.log(`Soak ${Math.round((Date.now()-start)/1000)}s: ${sample.map(s=>s.fps+' fps').join(', ')}; both seats Here.`);
  }
  result.durationMs=Date.now()-start;
  await mkdir('test-results',{recursive:true});
  await a.screenshot({path:'test-results/soak-phone.png'});await b.screenshot({path:'test-results/soak-laptop.png'});
  await writeFile('test-results/step2-soak.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({durationMs:result.durationMs,disconnects:result.disconnects,errors:result.errors,hardware:result.hardware}));
} finally {await browser.close();}
