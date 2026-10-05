import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.resolve(process.argv[2]||path.join(root,'dist-pack/third-party-sources'));
const entries=JSON.parse(fs.readFileSync(path.join(root,'third-party/windows-vips-sources.json'),'utf8'));
function hash(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');}
async function download(entry){
 const file=path.join(destination,entry.file);
 if(!file.startsWith(destination+path.sep))throw Error('Unsafe source path');
 if(fs.existsSync(file)&&hash(file)===entry.sha256)return;
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(entry.sourceGit){
  if(!/^[a-f0-9]{40}$/.test(entry.sourceGit.commit)||!/^https:\/\/(github.com|gitlab.com)\//.test(entry.sourceGit.url))throw Error('Invalid fixed source repository');
  const checkout=path.join(destination,'.git-sources',entry.name);
  if(!fs.existsSync(checkout))execFileSync('git',['clone','--no-checkout',entry.sourceGit.url,checkout],{stdio:'inherit'});
  execFileSync('git',['archive','--format=tar.gz',`--prefix=${entry.sourceGit.prefix}`,'-o',file,entry.sourceGit.commit],{cwd:checkout});
  if(hash(file)!==entry.sha256)throw Error(entry.file+': Git export SHA256 mismatch');
  console.log('Fixed source verified: '+entry.file);return;
 }
 const originalNames={imagequant:'libimagequant',tiff:'libtiff',expat:'expat'};
 const basename=path.basename(entry.file).replace(entry.name+'-',(originalNames[entry.name]||entry.name)+'-');
 const urls=[entry.url,`https://mirror.mxe.cc/${basename}`,entry.name==='expat'?`https://github.com/libexpat/libexpat/releases/download/R_${entry.version.replaceAll('.','_')}/${basename}`:entry.url];
 for(let attempt=0;attempt<urls.length;attempt++){
  try{
   const response=await fetch(urls[attempt],{signal:AbortSignal.timeout(120000)});
   if(!response.ok)throw Error('HTTP '+response.status);
   await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(file+'.partial'));
   if(hash(file+'.partial')!==entry.sha256)throw Error('Source SHA256 mismatch');
   fs.renameSync(file+'.partial',file);console.log('Source verified: '+entry.file);return;
  }catch(error){if(attempt===urls.length-1)throw Error(entry.file+': '+error.message);}
 }
}
// Bound concurrency to keep the download and checksum work predictable.
let next=0;const failures=[];
await Promise.all(Array.from({length:4},async()=>{while(next<entries.length){const entry=entries[next++];try{await download(entry);}catch(error){failures.push(error.message);console.error(error.message);}}}));
fs.copyFileSync(path.join(root,'third-party/windows-vips-sources.json'),path.join(destination,'sources.json'));
if(failures.length)throw Error(`${failures.length} source archives could not be verified`);
