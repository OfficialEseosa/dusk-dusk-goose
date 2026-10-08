import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import WebSocket from 'ws';
import {createChaseServer} from '../server/chase-server';
import {watchChase} from './chase-browser-helpers';
test('GPU resources stay bounded across repeated roster and arena changes',async({browser})=>{
  test.setTimeout(90000);const game=createChaseServer({clientDir:resolve('dist/client')});await new Promise<void>(r=>game.server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${(game.server.address() as {port:number}).port}`;
  const context=await browser.newContext({viewport:{width:667,height:375}}),page=await context.newPage(),state=watchChase(page),cdp=await context.newCDPSession(page);let script='';const sockets:WebSocket[]=[];
  cdp.on('Debugger.scriptParsed',s=>{if(/\/assets\/index-.*\.js$/.test(s.url))script=s.scriptId;});await cdp.send('Debugger.enable');
  try{
    await page.goto(url);await expect(page.locator('canvas')).toHaveAttribute('aria-busy','false');const source=(await cdp.send('Debugger.getScriptSource',{scriptId:script})).scriptSource,at=source.lastIndexOf('this.renderer.render(this.scene,this.camera)'),before=source.slice(0,at);expect(at).toBeGreaterThan(0);
    await cdp.send('Debugger.setBreakpoint',{location:{scriptId:script,lineNumber:before.split('\n').length-1,columnNumber:at-before.lastIndexOf('\n')-1},condition:'(window.__gpuView=this,false)'});await expect.poll(()=>page.evaluate(()=>!!(window as any).__gpuView?.renderer)).toBe(true);
    await page.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>state.snapshot?.code).toBeTruthy();
    for(let i=0;i<5;i++){const ws=new WebSocket(`${url.replace('http:','ws:')}/ws`);sockets.push(ws);await new Promise<void>((r,reject)=>{ws.once('open',()=>ws.send(JSON.stringify({type:'join',code:state.snapshot!.code,name:`Friend ${i}`})));ws.once('error',reject);ws.on('message',(raw,binary)=>{if(!binary&&JSON.parse(raw.toString()).type==='seat')r();});});}
    await expect.poll(()=>state.snapshot?.multi?.stage,{timeout:10000}).toBe('playing');const room=game.rooms.get(state.snapshot!.code)!,roster=[...room.seats.values()],measurements=[];
    for(let cycle=0;cycle<11;cycle++){
      // Fixture advances real director beginnings to exercise role/scene disposal,
      // without pretending eleven complete human rounds have been played.
      for(const count of [3,6]){room.sim=room.multi!.begin(roster.slice(0,count),Date.now());for(const entity of room.sim.entities)entity.safeUntil=500;const run=room.multi!.runId;await expect.poll(()=>state.snapshot?.multi?.runId).toBe(run);await page.waitForTimeout(350);await expect.poll(()=>page.evaluate(({run,count})=>{const v=(window as any).__gpuView;return v.eventRun===run&&v.figures.size===Math.max(4,count)&&v.arena.width===(count>=4?34:26);},{run,count})).toBe(true);}
      const metrics=await page.evaluate(()=>{const v=(window as any).__gpuView;return {textures:v.renderer.info.memory.textures,geometries:v.renderer.info.memory.geometries,programs:v.renderer.info.programs.length,figures:v.figures.size,particles:v.effects.life.length};});measurements.push(metrics);
    }
    await mkdir('evidence/phase6',{recursive:true});await writeFile('evidence/phase6/memory-cycles-diagnostic.json',JSON.stringify({measurements,errors:state.errors},null,2));
    const settled=measurements.slice(6),reference=settled[0];for(const m of settled){expect(m.textures).toBeLessThanOrEqual(reference.textures);expect(m.geometries).toBeLessThanOrEqual(reference.geometries);expect(m.figures).toBe(6);expect(m.particles).toBe(256);}
    expect(state.errors).toEqual([]);await mkdir('evidence/phase6',{recursive:true});await writeFile('evidence/phase6/memory-cycles.json',JSON.stringify({fixtureDrivenBeginnings:true,warmupCycles:6,measuredCycles:5,measurements,errors:state.errors,physicalPhone:false},null,2));
  }finally{await context.close();for(const ws of sockets)ws.terminate();await game.close();}
});
