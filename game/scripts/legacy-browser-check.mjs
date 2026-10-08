import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {resolve,basename,sep} from 'node:path';
const root=resolve('.'),fixture=resolve('.legacy-check');
if(!fixture.startsWith(root+sep))throw new Error('Fixture escaped game directory');
await mkdir(fixture,{recursive:true});
for(const name of ['client','server','shared','public','tests','tsconfig.client.json','tsconfig.server.json','vite.config.ts','playwright.config.ts'])await cp(resolve(name),resolve(fixture,name),{recursive:true,filter:path=>!basename(path).startsWith('chase')});
const config=await readFile(resolve(fixture,'playwright.config.ts'),'utf8');await writeFile(resolve(fixture,'playwright.config.ts'),config.replace('"chase*.spec.ts"','"*.spec.ts"'));
await cp(resolve('../legacy/hideandseek-public'),resolve(fixture,'public'),{recursive:true});
const originalIndex=execFileSync('git',['show','old-game-end-f802515:game/index.html'],{encoding:'utf8'});await writeFile(resolve(fixture,'index.html'),originalIndex);
const pkg=JSON.parse(await readFile('package.json','utf8'));pkg.scripts.start='node dist/server/server/index.js';await writeFile(resolve(fixture,'package.json'),JSON.stringify(pkg,null,2));
async function run(args){const child=spawn(process.execPath,args,{cwd:fixture,stdio:'inherit'});await new Promise((accept,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?accept():reject(new Error(`Legacy command exited ${code}`)));});}
await run([resolve('node_modules/typescript/bin/tsc'),'-p','tsconfig.server.json']);
await run([resolve('node_modules/vite/bin/vite.js'),'build']);
await run([resolve('node_modules/@playwright/test/cli.js'),'test',...process.argv.slice(2)]);
