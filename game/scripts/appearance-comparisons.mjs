import {chromium} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root='evidence/appearance-fix';
const moments=[['title','Title'],['kid-side','Light on, backpedalling: side'],['kid-front','Light on, backpedalling: rear'],['goose-walk','Walking goose'],['goose-lunge','Lunging goose'],['goose-frozen','Frozen goose'],['goose-lit','Goose in a beam']];
const before=JSON.parse(await readFile(`${root}/before/metrics.json`,'utf8')).at(-1),after=JSON.parse(await readFile(`${root}/after/metrics.json`,'utf8')).at(-1);
const browser=await chromium.launch({args:['--use-angle=d3d11','--force-high-performance-gpu','--force_high_performance_gpu']});
try{
 for(const width of [667,1366]){
  const rows=moments.map(([name,label])=>`<section id="${name}"><h2>${label}</h2><div class="labels"><b>Before</b><b>After</b></div><div class="pair"><a href="before/${name}-${width}.png"><img src="before/${name}-${width}.png" width="${width}"></a><a href="after/${name}-${width}.png"><img src="after/${name}-${width}.png" width="${width}"></a></div></section>`).join('\n');
  const solo=width===667?`<section id="solo"><h2>Real solo, holding LIGHT from three seconds</h2><div class="labels"><b>Before: caught at ${before.elapsed.toFixed(2)}s</b><b>After: still a kid at 20s (caught at ${after.elapsed.toFixed(2)}s)</b></div><div class="pair"><img src="before/solo-caught-667.png" width="667"><img src="after/solo-20-seconds-667.png" width="667"></div></section>`:'';
  const html=`<!doctype html><meta charset="utf-8"><title>Appearance comparisons ${width}</title><style>body{margin:24px;background:#152342;color:#f6f2dd;font:18px system-ui;width:${width*2}px}h1{font-size:28px}h2{font-size:22px;margin:18px 0 10px}.pair,.labels{display:grid;grid-template-columns:${width}px ${width}px}.labels{padding:8px 0}.pair img{display:block}section{margin-bottom:30px}p{max-width:1000px}</style><h1>Before / after — ${width}px</h1><p>Original screenshots are unedited. The visual fixtures use the actual renderer with controlled motion, repeated lunge poses, and protected server seats; room IDs, character colours, animation times and framing vary. The solo comparison uses real input and server outcomes without a fixture. Click either original image to inspect it separately.</p>${rows}${solo}`;
  await writeFile(`${root}/compare-${width}.html`,html);
  const page=await browser.newPage({viewport:{width:width*2+48,height:900}});await page.goto(pathToFileURL(resolve(`${root}/compare-${width}.html`)).href);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
  if(width===667)for(const name of ['kid-side','goose-walk','solo'])await page.locator(`#${name}`).screenshot({path:`${root}/compare-${name}-667.png`});
  await page.close();
 }
}finally{await browser.close();}
