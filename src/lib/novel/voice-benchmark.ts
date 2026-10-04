import fs from "fs/promises";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { kokoroPaths, kokoroStatus } from "./tts-service";
import { getVoicePerformance, resolveVoicePerformance } from "./voice-performance";
import { PREVIEW_TEXT } from "./types";
const state=globalThis as typeof globalThis & {rmVoiceBenchmarkBusy?:boolean};
export async function benchmarkVoice(settings:{mode?:unknown;threads?:unknown}) {
  if(state.rmVoiceBenchmarkBusy)throw new Error("正在测速，请等待本次测试完成");
  if(!kokoroStatus().available)throw new Error("请先安装声音包");
  const performance=settings.mode===undefined?getVoicePerformance():resolveVoicePerformance(settings);
  state.rmVoiceBenchmarkBusy=true;
  let cache="";
  try {
    cache=await fs.mkdtemp(path.join(os.tmpdir(),"rm-voice-benchmark-"));
    const paths=kokoroPaths(),start=Date.now();
    const child=spawn(paths.python,["-u",paths.worker,"--model",paths.model,"--cache",cache,"--threads",String(performance.threads)],{windowsHide:true,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8",PYTHONDONTWRITEBYTECODE:"1"}});
    const lines=createInterface({input:child.stdout});let loadMs=0,diagnostics="";
    child.stderr.on("data",chunk=>{diagnostics=(diagnostics+chunk.toString()).slice(-1000);});
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      return await new Promise<{threads:number;loadMs:number;elapsed:number;duration:number;realtimeRatio:number}>((resolve,reject)=>{
        timer=setTimeout(()=>reject(new Error("测速超时，请降低线程数后重试")),90000);
        child.once("error",reject);child.once("exit",code=>reject(new Error(`语音测速进程停止 (${code}): ${diagnostics}`)));
        lines.on("line",line=>{
          try {
            const data=JSON.parse(line);
            if(data.ready){loadMs=Date.now()-start;child.stdin.write(JSON.stringify({id:"benchmark",text:PREVIEW_TEXT,speaker:3,cache})+"\n");}
            if(data.id==="benchmark") {
              if(data.error)throw new Error(data.error);
              if(!(data.duration>0)||!(data.elapsed>=0))throw new Error("测速结果无效");
              resolve({threads:performance.threads,loadMs,elapsed:data.elapsed,duration:data.duration,realtimeRatio:data.elapsed/data.duration});
            }
          }catch(e){reject(e);}
        });
      });
    }finally{clearTimeout(timer);child.kill();lines.close();}
  }finally{state.rmVoiceBenchmarkBusy=false;if(cache)await fs.rm(cache,{recursive:true,force:true});}
}
