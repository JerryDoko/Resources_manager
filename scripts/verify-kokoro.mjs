import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const root=path.resolve(arg('--root')||'runtime/kokoro');
const bundle=path.resolve(arg('--bundle')||path.join(root,'bundle',`${process.platform}-${process.arch}`));
const cache=await fs.mkdtemp(path.join(os.tmpdir(),'rm-voice-test-'));
const python=path.join(bundle,'python',process.platform==='win32'?'python.exe':'bin/python3');
const threads=Number(arg('--threads')||2),start=Date.now();let readyMs=0;
const child=spawn(python,['-u',path.join(root,'kokoro_worker.py'),'--model',path.join(bundle,'model'),'--cache',cache,'--threads',String(threads)],{windowsHide:true,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'}});
let diagnostics='';child.stderr.on('data',c=>{diagnostics=(diagnostics+c).slice(-2000);});
const lines=createInterface({input:child.stdout});
try {
  const result=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Voice verification timeout')),120000);
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Worker stopped ${code}: ${diagnostics}`));});
    lines.on('line',line=>{
      try {
        const data=JSON.parse(line);
        if(data.ready){readyMs=Date.now()-start;child.stdin.write(JSON.stringify({id:'smoke-test',text:arg('--text')||'你好，欢迎使用本地听书。',speaker:3,cache})+'\n');}
        if(data.id==='smoke-test'){clearTimeout(timer);data.error?reject(new Error(data.error)):resolve(data);}
      }catch(e){clearTimeout(timer);reject(e);}
    });
  });
  const audio=await fs.readFile(result.path);
  if(audio.subarray(0,4).toString()!=='RIFF'||!(result.duration>0))throw new Error('Invalid speech audio');
  console.log(JSON.stringify({ok:true,threads,loadMs:readyMs,generationSeconds:result.elapsed,duration:result.duration,realtimeRatio:result.elapsed/result.duration,bytes:audio.length}));
} finally {child.kill();lines.close();await fs.rm(cache,{recursive:true,force:true});}
