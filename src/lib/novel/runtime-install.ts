import fs from "fs";
import path from "path";
import https from "https";
import { createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { kokoroPaths,tts } from "./tts-service";
type Progress={running:boolean;phase:string;done:number;total:number;error:string};
const state=globalThis as typeof globalThis & { rmRuntimeInstall?:Progress };
export const installation=()=>state.rmRuntimeInstall ||= {running:false,phase:"",done:0,total:0,error:""};
const hash=(data:Buffer)=>createHash("sha256").update(data).digest("hex");
const target=()=>`${process.platform}-${process.arch}`;
function destination(){return path.join(process.env.RM_KOKORO_INSTALL_ROOT || path.join(process.env.RESOURCES_MANAGER_DATA || path.join(process.cwd(),"data"),"kokoro-runtime"),"bundle",target());}
async function verifyCopy(source:string,dest:string,modelOnly=false){
  const manifestFile=path.join(kokoroPaths().root,"manifests",`${target()}.json`);
  const manifest=JSON.parse(fs.readFileSync(manifestFile,"utf8")) as {sha256:Record<string,string>};
  const entries=Object.entries(manifest.sha256).filter(([name])=>!modelOnly||name.startsWith("model/"));
  const p=installation();p.phase="校验并安装";p.total=entries.length;p.done=0;
  for(const [name,expected] of entries){
    if(name.includes("..")||path.isAbsolute(name))throw new Error("声音清单路径无效");
    const from=path.join(source,name),to=path.join(dest,name),data=await fs.promises.readFile(from);
    if(hash(data)!==expected)throw new Error(`声音包校验失败: ${name}`);
    await fs.promises.mkdir(path.dirname(to),{recursive:true});await fs.promises.writeFile(to,data);
    if(name.startsWith("python/bin/")||name.endsWith(".so")||name.endsWith(".dylib"))await fs.promises.chmod(to,0o755);
    p.done++;
  }
  return manifestFile;
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
  const p=installation();if(p.running)throw new Error("声音包正在安装");Object.assign(p,{running:true,phase:"准备安装",done:0,total:0,error:""});
  void (async()=>{
    const dest=destination(),stage=dest+".partial";
    try{
      await fs.promises.rm(stage,{recursive:true,force:true});await fs.promises.mkdir(stage,{recursive:true});
      let manifest:string;
      if(directory){manifest=await verifyCopy(directory,stage);}
      else{
        const bundled=path.join(kokoroPaths().root,"bundle",target());
        if(!fs.existsSync(path.join(bundled,"python")))throw new Error("缺少 Python 运行时，请选择完整离线声音包");
        await fs.promises.cp(path.join(bundled,"python"),path.join(stage,"python"),{recursive:true,verbatimSymlinks:true});
        const archive=path.join(stage,"model.tar.bz2");await download("https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/assets/265069793",archive);
        if(hash(await fs.promises.readFile(archive))!=="a1e94694776049035c4f2c6529f003aaece993c76aae9a78995831c3c4dcafc6")throw new Error("下载模型校验失败，请重试");
        const unpack=path.join(stage,"unpack");await fs.promises.mkdir(unpack);
        await promisify(execFile)("tar",["-xf",archive,"-C",unpack],{windowsHide:true});
        await fs.promises.rename(path.join(unpack,"kokoro-int8-multi-lang-v1_1"),path.join(unpack,"model"));manifest=await verifyCopy(unpack,stage,true);
        await fs.promises.rm(unpack,{recursive:true,force:true});await fs.promises.unlink(archive);
      }
      await fs.promises.copyFile(manifest,path.join(stage,"manifest.json"));tts().stop();
      await fs.promises.rm(dest,{recursive:true,force:true});await fs.promises.rename(stage,dest);p.phase="安装完成";
    }catch(e){p.error=e instanceof Error?e.message:String(e);p.phase="安装失败，可重试";await fs.promises.rm(stage,{recursive:true,force:true});}
    finally{p.running=false;}
  })();return p;
}
