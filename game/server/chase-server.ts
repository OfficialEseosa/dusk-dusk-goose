import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocket,WebSocketServer} from 'ws';
import {ChaseSimulation} from './chase-simulation.js';
import {clearPath,distance,type Entity} from '../shared/chase.js';
interface Seat {id:string;name:string;token:string;socket?:WebSocket;lastInput:number;disconnected?:number;credit:number;moveAt:number;seq:number}
interface Room {code:string;sim:ChaseSimulation;seats:Map<string,Seat>;emptyAt?:number;resultsAt?:number}
export function createChaseServer(options:{clientDir?:string;maxRooms?:number}={}){
  const bootId=randomUUID(),rooms=new Map<string,Room>(),sessions=new Map<WebSocket,{room?:Room;seat?:Seat;window:number;count:number;alive:boolean}>();
  const root=resolve(options.clientDir??fileURLToPath(new URL('../../client',import.meta.url)));
  const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.mp3':'audio/mpeg','.woff2':'font/woff2','.svg':'image/svg+xml','.json':'application/json'};
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    try {const pathname=decodeURIComponent(new URL(req.url??'/', 'http://local').pathname);const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(root+sep)){res.writeHead(404);res.end();return;}const info=await stat(file);if(!info.isFile())throw new Error();
      res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-cache');res.end(req.method==='HEAD'?undefined:await readFile(file));
    }catch{res.writeHead(404);res.end('Not found');}
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:4096});
  server.on('upgrade',(req,socket,head)=>{let valid=false;try{valid=!req.headers.origin||new URL(req.headers.origin).host===req.headers.host;}catch{}
    if(!valid||req.url!=='/ws'){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
  function send(ws:WebSocket,msg:unknown){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<64000)ws.send(JSON.stringify(msg));}
  function start(room:Room){room.sim=new ChaseSimulation('solo',randomBytes(4).readUInt32LE());for(const seat of room.seats.values())room.sim.add(seat.id,seat.name);room.sim.add('g0','Chaser',true,'goose',{x:7,z:6});room.resultsAt=undefined;}
  wss.on('connection',ws=>{
    const session={window:Date.now(),count:0,alive:true} as {room?:Room;seat?:Seat;window:number;count:number;alive:boolean};sessions.set(ws,session);
    send(ws,{type:'hello',bootId});ws.on('pong',()=>session.alive=true);
    ws.on('message',raw=>{const now=Date.now();if(now-session.window>=1000){session.window=now;session.count=0;}if(++session.count>40)return;
      let m:any;try{m=JSON.parse(raw.toString());}catch{ws.close(1007,'Invalid message');return;}
      if(!m||typeof m!=='object')return;
      if(m.type==='ping'){send(ws,{type:'pong',clientTime:m.clientTime,serverTime:now});return;}
      if(m.type==='create'||m.type==='join'||m.type==='resume'){
        if(session.seat)return;
        let room:Room|undefined,seat:Seat|undefined;
        if(m.type==='resume'){
          room=typeof m.code==='string'?rooms.get(m.code):undefined;
          seat=room&&typeof m.token==='string'?[...room.seats.values()].find(s=>{const a=Buffer.from(s.token),b=Buffer.from(m.token);return a.length===b.length&&timingSafeEqual(a,b);}):undefined;
          if(!seat||!room||m.bootId!==bootId){send(ws,{type:'ended',message:'The lights came back on. That night ended. Play a new one!'});return;}
          if(seat.socket&&seat.socket!==ws){const old=seat.socket;sessions.delete(old);send(old,{type:'displaced'});old.close(4001,'Seat continued elsewhere');}
        } else {
          if(m.type==='create'){
            if(rooms.size>=(options.maxRooms??25)){send(ws,{type:'error',message:'The parks are busy. Try again in a moment.'});return;}
            const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code:string;do{code=Array.from(randomBytes(5),n=>alphabet[n%alphabet.length]).join('');}while(rooms.has(code));
            room={code,sim:new ChaseSimulation(),seats:new Map()};rooms.set(code,room);
          }else room=typeof m.code==='string'?rooms.get(m.code.toUpperCase()):undefined;
          if(!room){send(ws,{type:'error',message:'That room is gone. Check the code or start a new night.'});return;}
          if(room.seats.size>=6){send(ws,{type:'error',message:'Six friends already fill this park.'});return;}
          seat={id:randomUUID(),name:typeof m.name==='string'?m.name.trim().slice(0,16)||'Kid':'Kid',token:randomBytes(24).toString('hex'),lastInput:now,credit:.3,moveAt:now,seq:-1};room.seats.set(seat.id,seat);
          if(room.seats.size===1)start(room);else room.sim.add(seat.id,seat.name,false,'goose',{x:10,z:6});
        }
        seat.socket=ws;seat.disconnected=undefined;seat.lastInput=now;room.emptyAt=undefined;session.room=room;session.seat=seat;
        send(ws,{type:'seat',id:seat.id,token:seat.token,code:room.code,bootId,nextSeq:seat.seq+1,snapshot:room.sim.snapshot(room.code)});return;
      }
      const room=session.room,seat=session.seat;if(!room||!seat||seat.socket!==ws)return;const e=room.sim.entities.find(p=>p.id===seat.id)!;
      if(m.type==='retry'&&room.sim.phase==='results'&&room.sim.now-(room.resultsAt??room.sim.now)>=1.8){start(room);return;}
      if(m.type==='input'){
        if(!Number.isSafeInteger(m.seq)||m.seq<=seat.seq||!Number.isFinite(m.x)||!Number.isFinite(m.z)||!Number.isFinite(m.facing)||typeof m.held!=='boolean')return;
        seat.seq=m.seq;seat.lastInput=now;e.bot=false;seat.credit=Math.min(.6,seat.credit+room.sim.speed(e)*Math.min(1,(now-seat.moveAt)/1000));seat.moveAt=now;
        const d=distance(e,m),t=room.sim.now-e.lungeAt,committed=e.role==='goose'&&t<.84;
        if(e.frozenUntil<=room.sim.now&&!committed&&d<=seat.credit+.001&&clearPath(e,m,room.sim.arena)){e.vx=(m.x-e.x)*20;e.vz=(m.z-e.z)*20;e.x=m.x;e.z=m.z;e.facing=m.facing;seat.credit=Math.max(0,seat.credit-d);}
        else if(d>.05)send(ws,{type:'correction',x:e.x,z:e.z});
        e.held=m.held;if(m.lunge===true)room.sim.lunge(e);
      }
    });
    ws.on('close',()=>{const s=sessions.get(ws);sessions.delete(ws);if(s?.seat?.socket===ws){s.seat.socket=undefined;s.seat.disconnected=Date.now();}});
  });
  let last=Date.now();const timer=setInterval(()=>{const now=Date.now(),dt=Math.min(.1,(now-last)/1000);last=now;
    for(const [code,room] of rooms){
      for(const [id,seat] of room.seats){const e=room.sim.entities.find(p=>p.id===id);if(e&&now-seat.lastInput>1500)e.bot=true;
        if(seat.disconnected&&now-seat.disconnected>20000)room.seats.delete(id);}
      if(![...room.seats.values()].some(s=>s.socket)){room.emptyAt??=now;if(now-room.emptyAt>60000){rooms.delete(code);continue;}}
      room.sim.step(dt);
      if(room.sim.phase==='results'){room.resultsAt??=room.sim.now;/* wall clock keeps retry independent of paused simulation */
        if(!('resultWall' in room))(room as Room&{resultWall:number}).resultWall=now;
        const end=(room as Room&{resultWall:number}).resultWall;
        if(now-end>4000){delete (room as Room&{resultWall?:number}).resultWall;start(room);}else room.sim.now+=dt;
      }
      for(const seat of room.seats.values())if(seat.socket)send(seat.socket,{type:'snapshot',snapshot:room.sim.snapshot(code)});
    }
  },50);timer.unref();
  const heartbeat=setInterval(()=>{for(const [ws,s] of sessions){if(!s.alive){ws.terminate();continue;}s.alive=false;ws.ping();}},5000);heartbeat.unref();
  return {server,bootId,rooms,async close(){clearInterval(timer);clearInterval(heartbeat);for(const ws of sessions.keys())ws.terminate();await new Promise<void>(r=>wss.close(()=>r()));await new Promise<void>(r=>server.close(()=>r()));}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const game=createChaseServer();const port=Number(process.env.PORT??5173);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
  game.server.listen(port,'0.0.0.0',()=>console.log(`Dusk Dusk Goose listening on ${port}`));
  for(const sig of ['SIGINT','SIGTERM'] as const)process.once(sig,()=>void game.close().then(()=>process.exit(0)));
}
