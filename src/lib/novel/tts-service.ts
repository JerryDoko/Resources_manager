import fs from "fs";
import path from "path";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { createInterface } from "readline";
import { randomUUID } from "crypto";
import { getProfileDataDir } from "@/lib/profiles";
import { assertSession, onSessionCancel } from "./sessions";
import { digest } from "./chunks";
import { NARRATION_VERSION, prepareSpeech } from "./narration";
import { getVoicePerformance } from "./voice-performance";
type Result = { path: string; cached: boolean; duration: number; elapsed: number };
type Request = { profileId: string; itemId: string; sessionId: string; text: string; voiceId: number; priority: "foreground" | "prefetch" };
type Job = { key: string; request: Request; subscribers: Map<string, { request: Request; resolve: (r: Result) => void; reject: (e: Error) => void }[]>; priority: number };
export function kokoroPaths() {
  const root = process.env.RM_KOKORO_ROOT || path.join(process.cwd(), "runtime/kokoro");
  const installed=path.join(process.env.RM_KOKORO_INSTALL_ROOT || path.join(process.env.RESOURCES_MANAGER_DATA || path.join(process.cwd(),"data"),"kokoro-runtime"),"bundle",`${process.platform}-${process.arch}`);
  const bundle = fs.existsSync(path.join(installed,"manifest.json"))?installed:path.join(root,"bundle",`${process.platform}-${process.arch}`);
  return { root, bundle, model: path.join(bundle,"model"), worker: path.join(root,"kokoro_worker.py"), python: path.join(bundle,"python",process.platform === "win32" ? "python.exe" : "bin/python3") };
}
export function kokoroStatus() {
  const p=kokoroPaths();
  let model = "";
  try { model = JSON.parse(fs.readFileSync(path.join(p.bundle,"manifest.json"),"utf8")).model || ""; } catch { /* Not yet installed. */ }
  const available = [p.python,p.worker,path.join(p.model,"voices.bin"),path.join(p.model,"tokens.txt"),path.join(p.bundle,"manifest.json")].every(f=>fs.existsSync(f)) && fs.readdirSync(p.model).some(f=>f.endsWith(".onnx"));
  return { available, model, platform: `${process.platform}-${process.arch}` };
}
class TtsService {
  child: ChildProcessWithoutNullStreams | null = null;
  threads = 2;
  ready: Promise<void> | null = null;
  jobs = new Map<string, Job>(); queue: Job[] = []; running = false;
  cache = new Map<string, Result>(); waiting: { id: string; resolve: (r: Result) => void; reject: (e: Error) => void } | null = null;
  constructor() {
    onSessionCancel(id => {
      for (const job of this.jobs.values()) {
        for (const sub of job.subscribers.get(id) || []) sub.reject(new Error("朗读会话已取消"));
        job.subscribers.delete(id);
      }
      this.queue = this.queue.filter(j => { if(j.subscribers.size) return true; this.jobs.delete(j.key); return false; });
    });
    process.once("exit",()=>this.child?.kill());
    for (const signal of ["SIGTERM","SIGINT"] as const) process.once(signal,()=>{ this.child?.kill(); process.exit(0); });
  }
  async start(cache: string) {
    const threads = getVoicePerformance().threads;
    if (this.ready && this.threads !== threads) this.stop();
    if (this.ready) return this.ready;
    if (!kokoroStatus().available) throw new Error("本地声音包尚未安装，请在小说导入菜单中安装声音包");
    const p=kokoroPaths();
    this.threads = threads;
    const child = this.child = spawn(p.python,["-u",p.worker,"--model",p.model,"--cache",cache,"--threads",String(threads)],{ windowsHide:true,env:{...process.env,PYTHONUTF8:"1",PYTHONIOENCODING:"utf-8",PYTHONDONTWRITEBYTECODE:"1"} });
    this.ready = new Promise<void>((resolve,reject)=> {
      const timer=setTimeout(()=>{ reject(new Error("声音模型启动超时")); child.kill(); },90000);
      const lines=createInterface({input:child.stdout});
      lines.on("line",line=> {
        try {
          const data=JSON.parse(line);
          if(data.ready) { clearTimeout(timer); resolve(); }
          else if(this.waiting && this.waiting.id === data.id) {
            if(data.error) this.waiting.reject(new Error(data.error)); else this.waiting.resolve(data);
            this.waiting=null;
          }
        } catch { /* Protocol diagnostics never include book text. */ }
      });
      child.stderr.on("data",()=>{});
      const fail=()=>{ clearTimeout(timer); lines.close(); reject(new Error("本地声音进程已停止")); if(this.child===child){this.waiting?.reject(new Error("本地声音进程已停止，请重试"));this.waiting=null;this.child=null;this.ready=null;} };
      child.once("error",fail); child.once("exit",fail);
    });
    return this.ready;
  }
  synthesize(request: Request): Promise<Result> {
    assertSession(request.profileId,request.itemId,request.sessionId);
    if (!Number.isInteger(request.voiceId)||request.voiceId<3||request.voiceId>102) throw new Error("中文音色无效");
    const text=prepareSpeech(request.text);
    if(!text||text.length>1200) throw new Error("此段没有可朗读文字或过长");
    const key=`${request.profileId}:${digest(`${kokoroStatus().model}|${NARRATION_VERSION}|${request.voiceId}|${text}`)}`;
    const hit=this.cache.get(key);
    if(hit&&fs.existsSync(hit.path)) return Promise.resolve({...hit,cached:true,elapsed:0});
    return new Promise((resolve,reject)=>{
      let job=this.jobs.get(key);
      if(!job){job={key,request:{...request,text},subscribers:new Map(),priority:request.priority==="foreground"?0:1};this.jobs.set(key,job);this.queue.push(job);}
      if(request.priority==="foreground")job.priority=0;
      const subs=job.subscribers.get(request.sessionId)||[];subs.push({request,resolve,reject});job.subscribers.set(request.sessionId,subs);
      void this.pump();
    });
  }
  async pump() {
    if(this.running)return;this.running=true;
    while(this.queue.length){
      this.queue.sort((a,b)=>a.priority-b.priority); const job=this.queue.shift()!;
      try {
        const first=[...job.subscribers.values()].flat()[0]; if(!first)continue;
        const r=first.request; assertSession(r.profileId,r.itemId,r.sessionId);
        const cache=path.join(getProfileDataDir(r.profileId),"novel-audio/kokoro");
        fs.mkdirSync(cache,{recursive:true}); await this.start(cache);
        const active=[...job.subscribers.values()].flat()[0]; if(!active)continue;
        assertSession(active.request.profileId,active.request.itemId,active.request.sessionId);
        const id=randomUUID();
        const result=await new Promise<Result>((resolve,reject)=>{
          const timer=setTimeout(()=>{this.child?.kill();reject(new Error("语音生成超时，请重试"));},120000);
          this.waiting={id,resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}};
          this.child!.stdin.write(JSON.stringify({id,text:job.request.text,speaker:r.voiceId,cache})+"\n");
        });
        if(path.dirname(result.path)!==cache||!/^[a-f0-9]{64}\.wav$/.test(path.basename(result.path)))throw new Error("声音缓存路径无效");
        this.cache.set(job.key,result);
        if(this.cache.size>500)this.cache.delete(this.cache.keys().next().value!);
        for(const sub of [...job.subscribers.values()].flat()) {try{assertSession(sub.request.profileId,sub.request.itemId,sub.request.sessionId);sub.resolve(result);}catch(e){sub.reject(e as Error);}}
      } catch(e){ for(const sub of [...job.subscribers.values()].flat())sub.reject(e as Error); }
      finally{this.jobs.delete(job.key);}
    }
    this.running=false;
  }
  stop(){this.child?.kill();this.child=null;this.ready=null;this.cache.clear();}
}
const globalTts=globalThis as typeof globalThis & { rmNovelTts?: TtsService };
export const tts=()=>globalTts.rmNovelTts ||= new TtsService();
