import fs from "fs";
import path from "path";
import https from "https";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { kokoroPaths,tts } from "./tts-service";
import { probeWorker } from "./worker-probe";
import { benchmarkRunning } from "./runtime-benchmark";
type Progress={running:boolean;phase:string;done:number;total:number;error:string};
const state=globalThis as typeof globalThis & { rmRuntimeInstall?:Progress };
export const installation=()=>state.rmRuntimeInstall ||= {running:false,phase:"",done:0,total:0,error:""};
async function fileHash(file:string){
  const hash=createHash("sha256");
  for await(const chunk of fs.createReadStream(file))hash.update(chunk);
  return hash.digest("hex");
}
const target=()=>`${process.platform}-${process.arch}`;
function destination(){return path.join(process.env.RM_KOKORO_INSTALL_ROOT || path.join(process.env.RESOURCES_MANAGER_DATA || path.join(process.cwd(),"data"),"kokoro-runtime"),"bundle",target());}
const requiredModelFiles = ["voices.bin", "tokens.txt", "lexicon-us-en.txt", "lexicon-zh.txt", "date-zh.fst", "number-zh.fst", "phone-zh.fst", "LICENSE"];
export function findModelDirectory(directory: unknown) {
  if (typeof directory !== "string" || !directory.trim() || !path.isAbsolute(directory)) throw new Error("请选择解压后的 Kokoro 模型目录，不是 Books 书库");
  const candidates = [directory, path.join(directory, "model"), path.join(directory, "kokoro-multi-lang-v1_1"), path.join(directory, "kokoro-int8-multi-lang-v1_1")];
  const model = candidates.find(dir => fs.existsSync(path.join(dir, "model.onnx")) || fs.existsSync(path.join(dir, "model.int8.onnx")));
  if (!model) throw new Error("未找到 model.onnx / model.int8.onnx，请先解压 Kokoro v1.1 中英声音包；catalog.json 属于旧书库");
  return model;
}
async function copyModel(source: string, dest: string) {
  const names = [...requiredModelFiles, fs.existsSync(path.join(source, "model.onnx")) ? "model.onnx" : "model.int8.onnx"];
  const entries: string[] = [];
  let bytes = 0;
  const collect = async (name: string, depth = 0) => {
    const file = path.join(source, name), stat = await fs.promises.lstat(file);
    if (depth > 12 || stat.isSymbolicLink()) throw new Error("声音包不能包含符号链接或过深目录");
    if (stat.isDirectory()) {
      for (const child of (await fs.promises.readdir(file)).sort()) await collect(path.join(name, child), depth + 1);
    } else {
      if (!stat.isFile() || !stat.size || stat.size > 1024 * 1024 * 1024) throw new Error(`声音包文件无效: ${name}`);
      bytes += stat.size; entries.push(name);
      if (bytes > 2 * 1024 * 1024 * 1024 || entries.length > 4000) throw new Error("声音包超过大小或文件数上限");
    }
  };
  for (const name of names) await collect(name);
  if (!(await fs.promises.lstat(path.join(source, "espeak-ng-data"))).isDirectory()) throw new Error("缺少 espeak-ng-data 目录");
  await collect("espeak-ng-data");
  const p = installation(); p.phase = "复制模型"; p.done = 0; p.total = entries.length;
  const checksums: Record<string, string> = {};
  for (const name of entries) {
    // Only model data is imported. External Python, scripts and executables are never run.
    const to = path.join(dest, "model", name); await fs.promises.mkdir(path.dirname(to), { recursive: true });
    await fs.promises.copyFile(path.join(source, name), to);
    checksums[`model/${name.split(path.sep).join("/")}`] = await fileHash(to); p.done++;
  }
  const manifest = { target: target(), model: names.includes("model.onnx") ? "kokoro-v1.1-full" : "kokoro-v1.1-int8", sha256: checksums };
  await fs.promises.writeFile(path.join(dest, "manifest.json"), JSON.stringify(manifest, null, 2));
}
function download(url:string,file:string,depth=0):Promise<void>{
  if(depth>5)throw new Error("声音包重定向过多");
  const u=new URL(url);if(u.protocol!=="https:"||!["api.github.com","github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"].includes(u.hostname))throw new Error("声音包下载来源无效");
  return new Promise((resolve,reject)=>{
    const req=https.get(u,{headers:{Accept:"application/octet-stream","User-Agent":"ResourcesManager"}},res=>{
      if(res.statusCode&&res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();clearTimeout(timer);download(new URL(res.headers.location,url).href,file,depth+1).then(resolve,reject);return;}
      if(res.statusCode!==200){res.resume();clearTimeout(timer);reject(new Error(`声音包下载失败: ${res.statusCode}`));return;}
      const p=installation();p.total=Number(res.headers["content-length"])||0;p.done=0;p.phase="下载模型";
      const out=fs.createWriteStream(file);res.on("data",chunk=>{p.done+=chunk.length;if(p.done>400*1024*1024)req.destroy(new Error("声音包过大"));});res.pipe(out);
      out.on("finish",()=>{clearTimeout(timer);out.close();resolve();});out.on("error",reject);res.on("error",e=>{out.destroy();reject(e);});
    });const timer=setTimeout(()=>req.destroy(new Error("声音包下载超时，请重试")),300000);req.on("error",e=>{clearTimeout(timer);reject(e);});
  });
}
export function installRuntime(directory?:string){
  if(directory!==undefined && (typeof directory!=="string" || !directory.trim()))throw new Error("声音包路径无效");
  const p=installation();if(p.running)throw new Error("声音包正在安装");
  if(benchmarkRunning() || tts().isBusy())throw new Error("请暂停朗读并等待生成 / 速度测试结束后再更换声音包");
  Object.assign(p,{running:true,phase:"准备安装",done:0,total:0,error:""});
  void (async()=>{
    const dest=destination(),stage=dest+".partial",backup=dest+".previous";
    try{
      await fs.promises.rm(stage,{recursive:true,force:true});await fs.promises.mkdir(stage,{recursive:true});
      const bundled=path.join(kokoroPaths().root,"bundle",target());
      if(!fs.existsSync(path.join(bundled,"python")))throw new Error("缺少应用内置 Python 运行时，请重新安装 macOS 应用");
      await fs.promises.cp(path.join(bundled,"python"),path.join(stage,"python"),{recursive:true,verbatimSymlinks:true});
      if(directory){await copyModel(findModelDirectory(directory),stage);}
      else{
        const archive=path.join(stage,"model.tar.bz2");await download("https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/assets/265069737",archive);
        if(await fileHash(archive)!=="a3f4c73d043860e3fd2e5b06f36795eb81de0fc8e8de6df703245edddd87dbad")throw new Error("下载模型校验失败，请重试");
        const unpack=path.join(stage,"unpack");await fs.promises.mkdir(unpack);
        await promisify(execFile)("tar",["-xf",archive,"-C",unpack],{windowsHide:true});
        await copyModel(findModelDirectory(unpack),stage);
        await fs.promises.rm(unpack,{recursive:true,force:true});await fs.promises.unlink(archive);
      }
      p.phase="校验模型并试读";
      await probeWorker({python:path.join(stage,"python",process.platform==="win32"?"python.exe":"bin/python3"),worker:kokoroPaths().worker,model:path.join(stage,"model")},1,true);
      if(tts().isBusy())throw new Error("正在生成声音，请暂停后重试");
      tts().stop();
      await fs.promises.rm(backup,{recursive:true,force:true});
      const exists=fs.existsSync(dest);if(exists)await fs.promises.rename(dest,backup);
      try{await fs.promises.rename(stage,dest);}catch(e){if(exists)await fs.promises.rename(backup,dest);throw e;}
      await fs.promises.rm(backup,{recursive:true,force:true});p.phase="安装完成";
    }catch(e){p.error=e instanceof Error?e.message:String(e);p.phase="安装失败，可重试";await fs.promises.rm(stage,{recursive:true,force:true});}
    finally{p.running=false;}
  })();return p;
}
