import {spawn} from 'node:child_process';
import {readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const tsx=resolve('node_modules/tsx/dist/cli.mjs'),evidence=resolve('evidence/phase7');
await mkdir(evidence,{recursive:true});
const suites=[{name:'game',cwd:resolve('.'),match:n=>/^(server|chase).*\.test\.ts$/.test(n)},{name:'archived-story',cwd:resolve('../legacy/story'),match:n=>n.endsWith('.test.ts')}];
const passes=[];
for(let pass=1;pass<=5;pass++){
  const result={pass,suites:[]};
  for(const suite of suites){
    const files=(await readdir(resolve(suite.cwd,'tests'))).filter(suite.match).sort().map(n=>resolve(suite.cwd,'tests',n));
    const started=Date.now();let output='';
    const child=spawn(process.execPath,[tsx,'--test','--test-reporter=tap',...files],{cwd:suite.cwd,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
    const exit=await new Promise((accept,reject)=>{child.once('error',reject);child.once('exit',accept);});
    const number=label=>Number(output.match(new RegExp(`^# ${label} (\\d+)`,'m'))?.[1]??NaN);
    const summary={name:suite.name,tests:number('tests'),passed:number('pass'),failed:number('fail'),skipped:number('skipped'),exit,elapsedMs:Date.now()-started};
    result.suites.push(summary);console.log(JSON.stringify({pass,...summary}));
    if(exit!==0||!summary.tests||summary.passed!==summary.tests||summary.failed||summary.skipped){await writeFile(resolve(evidence,`server-failure-${pass}-${suite.name}.txt`),output);throw new Error(`Server pass ${pass} failed: ${suite.name}`);}
  }
  passes.push(result);await writeFile(resolve(evidence,'server-five-passes.json'),JSON.stringify({node:process.version,consecutive:passes.length,passes},null,2));
}
