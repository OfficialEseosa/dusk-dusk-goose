import {test,expect} from '@playwright/test';
import {createServer,connect,type Socket} from 'node:net';
import {watchChase} from './chase-browser-helpers';
test('silent browser-leg loss reclaims live stale seat while another session keeps playing',async({browser,baseURL})=>{
  const sockets=new Set<Socket>(),tunnels:{client:Socket;upstream:Socket;blackhole:boolean}[]=[];let staleAtResume=false;
  const relay=createServer(client=>{
    const upstream=connect(Number(new URL(baseURL!).port),'127.0.0.1'),t={client,upstream,blackhole:false};sockets.add(client);sockets.add(upstream);
    client.once('data',data=>{if(data.toString().startsWith('GET /ws ')){if(tunnels.length)staleAtResume=!tunnels[0].upstream.destroyed;tunnels.push(t);}});
    client.pipe(upstream);upstream.pipe(client);
    client.on('close',()=>{sockets.delete(client);if(!t.blackhole)upstream.destroy();});client.on('error',()=>{if(!t.blackhole)upstream.destroy();});
    upstream.on('close',()=>{sockets.delete(upstream);client.destroy();});upstream.on('error',()=>client.destroy());
  });await new Promise<void>(r=>relay.listen(0,'127.0.0.1',r));
  const a=await browser.newContext({viewport:{width:667,height:375}}),b=await browser.newContext({viewport:{width:1366,height:768}});
  try{
    const p=await a.newPage(),q=await b.newPage(),one=watchChase(p),two=watchChase(q);
    await p.goto(`http://127.0.0.1:${(relay.address() as {port:number}).port}/`);await p.getByRole('button',{name:'Play',exact:true}).click();await expect.poll(()=>one.snapshot?.code).toBeTruthy();
    await q.goto('/');await q.getByRole('textbox',{name:'Room code'}).fill(one.snapshot!.code);await q.getByRole('button',{name:'Join friends'}).click();await expect.poll(()=>one.snapshot?.multi?.stage,{timeout:10000}).toBe('playing');
    const credential=await p.evaluate(()=>sessionStorage.getItem('ddg-seat')),id=one.id,run=one.snapshot!.multi!.runId,before=two.snapshot!.now;
    expect(tunnels).toHaveLength(1);const old=tunnels[0];old.blackhole=true;old.client.unpipe(old.upstream);old.upstream.unpipe(old.client);const began=Date.now();old.client.destroy();expect(old.upstream.destroyed).toBe(false);await expect(p.locator('#message')).toHaveText('Reconnecting…');
    await expect.poll(()=>tunnels.length,{timeout:3000}).toBe(2);await expect.poll(()=>one.receivedAt>began&&one.snapshot?.multi?.runId===run).toBe(true);
    expect(Date.now()-began).toBeLessThan(3000);expect(staleAtResume).toBe(true);await expect(p.locator('#message')).not.toContainText('Reconnecting');expect(one.id).toBe(id);expect(await p.evaluate(()=>sessionStorage.getItem('ddg-seat'))).toBe(credential);
    await expect.poll(()=>two.snapshot!.now).toBeGreaterThan(before+.3);expect(one.snapshot!.entities.filter(e=>e.id===id)).toHaveLength(1);expect([...one.errors,...two.errors]).toEqual([]);
  }finally{await a.close();await b.close();for(const socket of sockets)socket.destroy();await new Promise<void>(r=>relay.close(()=>r()));}
});
