import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {watchChase} from './chase-browser-helpers';

test('first gesture unlocks decoded audio, events produce signal, mute and hidden-tab suspension work',async({browser})=>{
  test.setTimeout(40000);const context=await browser.newContext({viewport:{width:667,height:375}}),page=await context.newPage(),state=watchChase(page),failures:string[]=[];
  page.on('response',response=>{if(response.url().includes('/audio/')&&!response.ok())failures.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(()=>{
    const bytesFrom=new WeakMap<ArrayBuffer,string>(),nativeFetch=window.fetch.bind(window);window.fetch=async(...args:Parameters<typeof fetch>)=>{const response=await nativeFetch(...args),read=response.arrayBuffer.bind(response);response.arrayBuffer=async()=>{const bytes=await read();bytesFrom.set(bytes,response.url);return bytes;};return response;};
    const Native=window.AudioContext,trace:any={contexts:[],gains:[],decoded:[],sources:[],oscillators:0,music:new Set()};(window as any).__audioTrace=trace;
    (window as any).AudioContext=class extends Native {
      constructor(options?:AudioContextOptions){super(options);trace.contexts.push(this);}
      createGain(){const gain=super.createGain();trace.gains.push(gain);return gain;}
      async decodeAudioData(bytes:ArrayBuffer){const buffer=await super.decodeAudioData(bytes);trace.decoded.push({bytes:bytes.byteLength,duration:buffer.duration,url:bytesFrom.get(bytes),buffer});return buffer;}
      createBufferSource(){const source=super.createBufferSource(),start=source.start.bind(source);source.start=((...args:Parameters<typeof start>)=>{const url=trace.decoded.find((b:any)=>b.buffer===source.buffer)?.url;if(url?.includes('/music/music_'))trace.music.add(source);trace.sources.push({url,duration:source.buffer?.duration,rate:source.playbackRate.value,when:args[0]});start(...args);}) as typeof source.start;source.addEventListener('ended',()=>trace.music.delete(source));return source;}
      createOscillator(){const osc=super.createOscillator(),start=osc.start.bind(osc);osc.start=(when?:number)=>{trace.oscillators++;start(when);};return osc;}
    };
  });
  try{
    await page.goto('/');expect(await page.evaluate(()=>(window as any).__audioTrace.contexts.length)).toBe(0);
    await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__audioTrace.contexts[0]?.state)).toBe('running');
    await expect.poll(()=>page.evaluate(()=>(window as any).__audioTrace.decoded.length)).toBe(27);
    await page.evaluate(()=>{const t=(window as any).__audioTrace,ctx=t.contexts[0],analyser=ctx.createAnalyser(),silent=ctx.createGain();analyser.fftSize=1024;silent.gain.value=0;t.gains[0].connect(analyser);analyser.connect(silent).connect(ctx.destination);t.analyser=analyser;t.rms=()=>{const a=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(a);return Math.sqrt(a.reduce((v:number,n:number)=>v+n*n,0)/a.length);};});
    await expect.poll(()=>page.evaluate(()=>(window as any).__audioTrace.rms())).toBeGreaterThan(.001);
    await expect.poll(()=>state.snapshot?.entities.some(e=>e.role==='goose'),{timeout:4000}).toBe(true);await page.keyboard.down('Space');await expect.poll(()=>state.snapshot?.events.some(e=>e.type==='freeze'&&e.actor===state.id),{timeout:6000}).toBe(true);await page.keyboard.up('Space');
    expect(await page.evaluate(()=>(window as any).__audioTrace.oscillators)).toBeGreaterThan(2);
    await expect.poll(()=>state.snapshot?.events.some(e=>e.type==='thaw'),{timeout:3000}).toBe(true);await expect.poll(()=>page.evaluate(()=>(window as any).__audioTrace.sources.some((s:any)=>s.url?.endsWith('/drop_001.mp3')))).toBe(true);
    await page.keyboard.press('KeyM');await expect.poll(()=>page.evaluate(()=>(window as any).__audioTrace.gains[0].gain.value)).toBeLessThan(.001);await expect.poll(()=>page.evaluate(()=>(window as any).__audioTrace.rms())).toBeLessThan(.0001);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('ddg-audio')!).muted)).toBe(true);
    await page.keyboard.press('KeyM');await expect.poll(()=>page.evaluate(()=>(window as any).__audioTrace.gains[0].gain.value)).toBeGreaterThan(.6);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>page.evaluate(()=>(window as any).__audioTrace.contexts[0].state)).toBe('suspended');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await page.keyboard.press('KeyD');await expect.poll(()=>page.evaluate(()=>(window as any).__audioTrace.contexts[0].state)).toBe('running');await page.waitForTimeout(300);expect(await page.evaluate(()=>(window as any).__audioTrace.music.size)).toBeLessThanOrEqual(1);
    const report=await page.evaluate(()=>{const t=(window as any).__audioTrace;return {decodedFiles:t.decoded.length,decodedSeconds:t.decoded.reduce((v:number,b:any)=>v+b.duration,0),bufferStarts:t.sources.length,thawCueObserved:t.sources.some((s:any)=>s.url?.endsWith('/drop_001.mp3')),oscillatorStarts:t.oscillators,contextState:t.contexts[0].state,masterGain:t.gains[0].gain.value,musicLayersAfterReturn:t.music.size};});
    expect(failures).toEqual([]);expect(state.errors).toEqual([]);await mkdir('evidence/phase5',{recursive:true});await writeFile('evidence/phase5/audio-check.json',JSON.stringify({...report,networkErrors:failures,browserErrors:state.errors,listeningReview:false},null,2));
  }finally{await context.close();}
});
