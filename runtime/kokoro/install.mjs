import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import os from 'node:os';
import { createWriteStream, createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const models = JSON.parse(await fs.readFile(path.join(ROOT, 'models.json'), 'utf8'));
const TARGET = `${process.platform}-${process.arch}`;
const PYTHON_URL = 'https://www.python.org/ftp/python/3.13.12/python-3.13.12-embed-amd64.zip';
const PYTHON_HASH = '76f238f606250c87c6beac75dccd35ee99070a13490555936abb6cb64ecce3d0';
const allowedHosts = new Set(['www.python.org', 'pypi.org', 'files.pythonhosted.org', 'api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
const emit = (phase, done = 0, total = 0) => console.log(JSON.stringify({ phase, done, total }));
const exists = async file => fs.access(file).then(() => true, () => false);
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function response(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error('下载重定向过多'));
  const u = new URL(url);
  if (u.protocol !== 'https:' || !allowedHosts.has(u.hostname)) return Promise.reject(new Error('下载来源无效'));
  return new Promise((resolve, reject) => {
    const req = https.get(u, { headers: { 'User-Agent': 'ResourcesManager', Accept: 'application/octet-stream' } }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        res.resume(); response(new URL(res.headers.location,u).href,depth+1).then(resolve,reject); return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`下载失败 HTTP ${res.statusCode}`)); return; }
      res.setTimeout(60000, () => res.destroy(new Error('下载超时，请重试'))); resolve(res);
    });
    req.setTimeout(60000, () => req.destroy(new Error('下载连接超时，请重试'))); req.on('error',reject);
  });
}
async function download(url,file,expected,phase) {
  if (await exists(file) && await sha256(file) === expected) { emit(`${phase} · 使用已校验缓存`); return; }
  await fs.mkdir(path.dirname(file),{recursive:true});
  const res = await response(url); let done=0,last=0;
  const total=Number(res.headers['content-length'])||0; emit(phase,0,total);
  res.on('data',chunk=>{done+=chunk.length;if(done>600*1024*1024)res.destroy(new Error('下载文件过大'));if(Date.now()-last>400){last=Date.now();emit(phase,done,total);}});
  const partial=`${file}.partial`;
  try {
    await pipeline(res,createWriteStream(partial));
    if (await sha256(partial)!==expected) throw new Error('下载校验失败，请重试');
    await fs.rename(partial,file); emit(phase,done,total);
  } catch(e) {await fs.rm(partial,{force:true});throw e;}
}
async function run(exe,args,options={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(exe,args,{windowsHide:true,...options});let output='';
    const collect=chunk=>{output=(output+chunk.toString()).slice(-4000);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    const timer=setTimeout(()=>child.kill(),600000);
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error(`配置失败 (${code}): ${output.trim()}`));});
  });
}
async function preparePython(stage,cache,source) {
  const dir=path.join(stage,'python');
  if(source&&await exists(source)) {emit('复制独立 Python 运行时');await fs.cp(source,dir,{recursive:true,verbatimSymlinks:true});}
  else {
    if(TARGET!=='win32-x64')throw new Error('当前平台请提供完整离线声音包，Windows x64 支持自动配置 Python');
    const archive=path.join(cache,'python-3.13.12-embed-amd64.zip');
    await download(PYTHON_URL,archive,PYTHON_HASH,'下载独立 Python（无需安装到系统）');
    await fs.mkdir(dir,{recursive:true});await run('tar',['-xf',archive,'-C',dir]);
    await fs.writeFile(path.join(dir,'python313._pth'),'python313.zip\n.\nLib/site-packages\nimport site\n');
    const python=path.join(dir,'python.exe'),site=path.join(dir,'Lib','site-packages');await fs.mkdir(site,{recursive:true});
    emit('准备 Python 包管理工具');
    const res=await response('https://pypi.org/pypi/pip/25.3/json');let data='';for await(const chunk of res)data+=chunk;
    const wheel=JSON.parse(data).urls.find(f=>f.filename.endsWith('.whl'));if(!wheel)throw new Error('未找到官方 pip 安装包');
    const wheelPath=path.join(cache,wheel.filename);await download(wheel.url,wheelPath,wheel.digests.sha256,'下载 Python 包管理工具');
    await run(python,['-c','import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',wheelPath,site]);
    emit('自动安装语音依赖（可能需要数分钟）');
    await run(python,['-m','pip','install','--only-binary=:all:','--disable-pip-version-check','--no-warn-script-location','--no-cache-dir','--target',site,'-r',path.join(ROOT,'requirements.txt')],{env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',PIP_CONFIG_FILE:process.platform==='win32'?'NUL':'/dev/null'}});
  }
  const python=path.join(dir,process.platform==='win32'?'python.exe':'bin/python3');emit('检查 Python 和语音依赖');
  await run(python,['-c','import sherpa_onnx,numpy,opencc;print("OK")']);return python;
}
async function writeManifest(stage,model) {
  const hashes={};
  async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.name==='__pycache__'||e.name==='manifest.json')continue;if(e.isDirectory())await walk(file);else if(e.isFile()||e.isSymbolicLink())hashes[path.relative(stage,file).split(path.sep).join('/')]=await sha256(file);}}
  emit('生成声音包校验清单');await walk(stage);
  await fs.writeFile(path.join(stage,'manifest.json'),JSON.stringify({target:TARGET,model,sha256:hashes},null,2));
}
const modelFiles = ['voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt','espeak-ng-data'];
export async function inspectVoiceSource(directory) {
  const source=path.resolve(directory.trim().replace(/^"(.*)"$/, '$1'));
  if(!await exists(source))throw new Error('所选声音目录不存在，请检查路径');
  if(await exists(path.join(source,'manifest.json')))return {kind:'bundle',source,manifestFile:path.join(source,'manifest.json')};
  if(await exists(path.join(source,'python'))&&await exists(path.join(source,'model'))) {
    const legacy=path.join(ROOT,'manifests',`${TARGET}.json`);
    if(await exists(legacy))return {kind:'bundle',source,manifestFile:legacy};
    throw new Error('完整离线声音包缺少 manifest.json，请重新制作');
  }
  const candidates=[source,path.join(source,'model')];
  for(const entry of await fs.readdir(source,{withFileTypes:true}))if(entry.isDirectory()&&entry.name.startsWith('kokoro-'))candidates.push(path.join(source,entry.name));
  for(const candidate of candidates) {
    if(!await exists(candidate))continue;
    const onnx=(await fs.readdir(candidate)).filter(name=>name.endsWith('.onnx'));
    if(!onnx.length)continue;
    if(onnx.length!==1)throw new Error('模型目录有多个 ONNX 文件，请选择只包含一个模型的目录');
    for(const name of modelFiles)if(!await exists(path.join(candidate,name)))throw new Error(`模型目录缺少 ${name}，请完整解压模型包`);
    return {kind:'model',source:candidate,modelId:onnx[0].includes('int8')?'kokoro-v1.1-int8':'kokoro-v1.1-fp32'};
  }
  throw new Error('未找到模型。请选择含 ONNX、voices.bin、tokens.txt 的目录或完整离线声音包');
}
export async function installVoice({destination,modelId='kokoro-v1.1-int8',directory,cache=path.join(path.dirname(destination),'downloads')}) {
  const model=models.find(m=>m.id===modelId);if(!model)throw new Error('未知语音模型');
  const dest=path.resolve(destination);if(dest===path.parse(dest).root||dest===ROOT)throw new Error('声音包安装路径无效');
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'rm-voice-')),backup=`${dest}.previous-${randomUUID().slice(0,8)}`;let saved=false;
  try {
    const local=directory?await inspectVoiceSource(directory):null;
    if(local?.kind==='bundle'){
      const {source,manifestFile}=local;
      const manifest=JSON.parse(await fs.readFile(manifestFile,'utf8'));
      if(manifest.target!==TARGET||!manifest.sha256||!Object.keys(manifest.sha256).length)throw new Error('离线声音包平台或校验清单无效');
      let done=0;const entries=Object.entries(manifest.sha256);
      for(const [name,expected] of entries){
        if(name.split(/[\\/]/).includes('..')||path.isAbsolute(name)||name.includes(':'))throw new Error('声音清单路径无效');
        const from=path.join(source,name),to=path.join(stage,name);if(await sha256(from)!==expected)throw new Error(`离线声音包校验失败: ${name}`);
        await fs.mkdir(path.dirname(to),{recursive:true});await fs.copyFile(from,to);if(name.startsWith('python/bin/'))await fs.chmod(to,0o755);emit('校验并安装离线声音包',++done,entries.length);
      }
      await fs.copyFile(manifestFile,path.join(stage,'manifest.json'));
    } else {
      const bundled=path.join(ROOT,'bundle',TARGET,'python'),installed=path.join(dest,'python');
      await preparePython(stage,cache,await exists(installed)?installed:bundled);
      if(local?.kind==='model') {
        emit('安装本地模型（无需重新下载）');
        const modelDest=path.join(stage,'model');await fs.mkdir(modelDest);
        const files=[...modelFiles,...(await fs.readdir(local.source)).filter(name=>name.endsWith('.onnx')||name.endsWith('.fst')), 'dict','LICENSE','README.md','lexicon-gb-en.txt'];
        for(const name of files)if(await exists(path.join(local.source,name)))await fs.cp(path.join(local.source,name),path.join(modelDest,name),{recursive:true,verbatimSymlinks:true});
        await writeManifest(stage,local.modelId);
      } else {
        const archive=path.join(cache,`${model.archive}.tar.bz2`);await download(model.url,archive,model.sha256,'下载语音模型');
        const unpack=path.join(stage,'unpack');await fs.mkdir(unpack);emit('解压语音模型');await run('tar',['-xf',archive,'-C',unpack]);
        await fs.rename(path.join(unpack,model.archive),path.join(stage,'model'));await fs.rm(unpack,{recursive:true,force:true});await writeManifest(stage,model.id);
      }
    }
    const modelDir=path.join(stage,'model');
    for(const file of modelFiles)if(!await exists(path.join(modelDir,file)))throw new Error(`模型资源不完整: ${file}`);
    if(!(await fs.readdir(modelDir)).some(f=>f.endsWith('.onnx')))throw new Error('缺少 ONNX 模型');
    const python=path.join(stage,'python',process.platform==='win32'?'python.exe':'bin/python3');emit('验证语音模型可加载');
    await run(python,['-c',"import sys,pathlib,sherpa_onnx as s;p=pathlib.Path(sys.argv[1]);k=s.OfflineTtsKokoroModelConfig(model=str(next(p.glob('*.onnx'))),voices=str(p/'voices.bin'),tokens=str(p/'tokens.txt'),data_dir=str(p/'espeak-ng-data'),lexicon=','.join(str(p/n) for n in ['lexicon-us-en.txt','lexicon-zh.txt']));c=s.OfflineTtsConfig(model=s.OfflineTtsModelConfig(kokoro=k,num_threads=2,provider='cpu'));t=s.OfflineTts(c);print(t.num_speakers)",modelDir]);
    if(await exists(dest)){await fs.rename(dest,backup);saved=true;}
    await fs.mkdir(path.dirname(dest),{recursive:true});
    try {await fs.rename(stage,dest);} catch(e) {if(e.code!=='EXDEV')throw e;try {await fs.cp(stage,dest,{recursive:true,verbatimSymlinks:true});} catch(copyError) {await fs.rm(dest,{recursive:true,force:true});throw copyError;}}
    if(saved)await fs.rm(backup,{recursive:true,force:true});emit('安装完成');return dest;
  } catch(e) {if(saved&&!await exists(dest))await fs.rename(backup,dest);throw e;}
  finally {await fs.rm(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
  installVoice({destination:arg('--dest')||path.join(ROOT,'bundle',TARGET),modelId:arg('--model'),directory:arg('--from')}).catch(e=>{console.log(JSON.stringify({error:e.message,phase:'安装失败，可重试'}));process.exitCode=1;});
}
