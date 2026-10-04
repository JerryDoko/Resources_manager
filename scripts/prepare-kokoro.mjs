import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const source = args[args.indexOf('--from') + 1];
const target = args.includes('--windows') ? 'win32-x64' : `${process.platform}-${process.arch}`;
const bundle = path.join(root, 'runtime/kokoro/bundle', target);
if (!args.includes('--from') || !source) throw new Error('Usage: node scripts/prepare-kokoro.mjs --from <Tingye source or portable Kokoro directory> [--windows]');
const isSource = fs.existsSync(path.join(source, 'macos_dev/kokoro_worker.py'));
const python = isSource ? (target === 'win32-x64' ? path.join(source,'build/windows-package/听页/Kokoro/python') : path.join(source,'.runtime/mac-portable/python')) : path.join(source,'python');
const model = isSource ? path.join(source,'models/kokoro-int8-multi-lang-v1_1') : path.join(source,'model');
for (const required of ['model.int8.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-zh.txt','espeak-ng-data','date-zh.fst','number-zh.fst','phone-zh.fst','LICENSE']) {
  if (!fs.existsSync(path.join(model,required))) throw new Error(`Missing model resource: ${required}`);
}
const exe = target === 'win32-x64' ? 'python.exe' : 'bin/python3';
if (!fs.existsSync(path.join(python,exe))) throw new Error('Missing standalone Python');
fs.mkdirSync(bundle,{recursive:true});
fs.rmSync(path.join(bundle,'python'),{recursive:true,force:true});
fs.cpSync(python,path.join(bundle,'python'),{recursive:true,dereference:false,verbatimSymlinks:true});
fs.cpSync(model,path.join(bundle,'model'),{recursive:true});
if (target === 'win32-x64') {
  const pth = fs.readdirSync(path.join(bundle,'python')).find(n=>/^python\d+\._pth$/.test(n));
  if (!pth) throw new Error('Missing Windows embedded Python _pth');
  fs.writeFileSync(path.join(bundle,'python',pth),`${pth.replace('._pth','.zip')}\n.\n../../..\nLib/site-packages\nimport site\n`);
}
const hashes = {};
function visit(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const p=path.join(dir,entry.name);
    if (entry.isDirectory()) visit(p);
    else if((entry.isFile() || entry.isSymbolicLink()) && !p.endsWith('manifest.json') && !p.includes('__pycache__')) hashes[path.relative(bundle,p).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  }
}
visit(bundle);
let versions = null;
if (target === `${process.platform}-${process.arch}`) {
  versions = JSON.parse(execFileSync(path.join(bundle,'python',exe),['-c','import sys,importlib.metadata as m,json;print(json.dumps({"python":sys.version,"sherpa-onnx":m.version("sherpa-onnx"),"numpy":m.version("numpy"),"opencc-python-reimplemented":m.version("opencc-python-reimplemented")}))'],{encoding:'utf8'}));
}
fs.writeFileSync(path.join(bundle,'manifest.json'),JSON.stringify({target,model:'kokoro-v1.1-int8',versions,sha256:hashes},null,2));
fs.mkdirSync(path.join(root,'runtime/kokoro/manifests'),{recursive:true});
fs.copyFileSync(path.join(bundle,'manifest.json'),path.join(root,'runtime/kokoro/manifests',`${target}.json`));
console.log(`Kokoro ready: ${bundle} (${Object.keys(hashes).length} checksummed files)`);
