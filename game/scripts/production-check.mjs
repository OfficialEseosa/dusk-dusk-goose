import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {readFile,access,mkdir,writeFile} from 'node:fs/promises';
import WebSocket from 'ws';
const directory=resolve(process.argv[2]??'.production-check-20261007'),port=5183;
const evidence=process.env.DDG_PRODUCTION_EVIDENCE_DIR??'evidence/phase6';
const pkg=JSON.parse(await readFile(resolve(directory,'package.json'),'utf8'));
if(pkg.scripts.start!=='node dist/server/server/chase-server.js')throw new Error('Unexpected production command');
let child;
async function start(){child=spawn(process.execPath,['dist/server/server/chase-server.js'],{cwd:directory,env:{...process.env,NODE_ENV:'production',PORT:String(port)},stdio:['ignore','pipe','pipe']});
  await new Promise((accept,reject)=>{const timeout=setTimeout(()=>reject(new Error('Start timed out')),10000);child.stdout.on('data',data=>{if(data.toString().includes(`listening on ${port}`)){clearTimeout(timeout);accept();}});child.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Early exit ${code}`));});child.once('error',reject);});}
async function stop(){if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill('SIGTERM');await ended;}}
async function message(request,type){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`);try{return await new Promise((accept,reject)=>{const timeout=setTimeout(()=>reject(new Error('WebSocket timed out')),4000);ws.once('open',()=>ws.send(JSON.stringify(request)));ws.on('message',raw=>{const data=JSON.parse(raw.toString());if(data.type===type){clearTimeout(timeout);accept(data);}});ws.once('error',reject);});}finally{ws.close();}}
try{
  await start();const response=await fetch(`http://127.0.0.1:${port}/`),html=await response.text();if(response.status!==200||!html.includes('Dusk Dusk Goose'))throw new Error('Wrong production page');
  const forbidden={};for(const route of ['/__debug','/@vite/client','/server/chase-server.ts','/live']){const result=await fetch(`http://127.0.0.1:${port}${route}`);forbidden[route]=result.status;if(result.status!==404)throw new Error(`Exposed ${route}`);}
  const seat=await message({type:'create',name:'Production check'},'seat');if(!seat.snapshot.solo)throw new Error('Solo did not start');
  await stop();await start();const ended=await message({type:'resume',code:seat.code,token:seat.token,bootId:seat.bootId},'ended');if(!ended.message.includes('night ended'))throw new Error('Restart message missing');
  let developmentToolsPresent=false;try{await access(resolve(directory,'node_modules/tsx'));developmentToolsPresent=true;}catch{}if(developmentToolsPresent)throw new Error('Development loader survived prune');
  await mkdir(evidence,{recursive:true});await writeFile(`${evidence}/production-check.json`,JSON.stringify({directory,node:process.version,startCommand:pkg.scripts.start,compiledStart:true,portFromEnvironment:true,page200:true,webSocketSolo:true,forbidden,restartReturnsFriendlyEnded:true,developmentToolsPresent},null,2));console.log('Production HTTP, WebSocket, restart and pruned-runtime checks passed.');
}finally{await stop();}
