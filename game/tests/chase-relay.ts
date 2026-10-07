import {createServer,connect,type Socket} from 'node:net';
/** Test-side TCP latency, including native WebSocket ping/pong. Production has no delay switch. */
export async function latencyRelay(upstreamPort:number,delay:number){
  const sockets=new Set<Socket>(),timers=new Set<ReturnType<typeof setTimeout>>();
  const server=createServer(client=>{const upstream=connect(upstreamPort,'127.0.0.1');client.setNoDelay(true);upstream.setNoDelay(true);let websocket=false,first=true;sockets.add(client);sockets.add(upstream);
    const forward=(socket:Socket,data:Buffer)=>{if(!websocket||!delay){if(!socket.destroyed)socket.write(data);return;}const timer=setTimeout(()=>{timers.delete(timer);if(!socket.destroyed)socket.write(data);},delay);timers.add(timer);};
    client.on('data',data=>{if(first){first=false;websocket=data.toString().startsWith('GET /ws ');}forward(upstream,data);});upstream.on('data',data=>forward(client,data));
    client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
    client.on('close',()=>{sockets.delete(client);upstream.destroy();});upstream.on('close',()=>{sockets.delete(upstream);client.destroy();});
  });await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  return {url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,async close(){for(const t of timers)clearTimeout(t);for(const s of sockets)s.destroy();await new Promise<void>(r=>server.close(()=>r()));}};
}
