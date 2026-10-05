import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'dist-pack','licenses');
fs.mkdirSync(output,{recursive:true});
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
const inventory=[];
const supplemental={
 '@napi-rs/canvas-win32-x64-msvc':'node_modules/@napi-rs/canvas/LICENSE',
 '@next/env':'node_modules/next/license.md',
 '@next/swc-win32-x64-msvc':'node_modules/next/license.md',
 '@swc/counter':'third-party/upstream/lgpl/SWC-APACHE',
 'boolbase':'third-party/upstream/boolbase/LICENSE',
 'client-only':'third-party/upstream/client-only/LICENSE',
 'drizzle-orm':'third-party/upstream/drizzle-orm/LICENSE',
 'isarray':'node_modules/isarray/LICENSE'
};
function licenseFiles(directory,base=directory){
 const result=[];
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(entry.name==='node_modules'||entry.isSymbolicLink())continue;
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())result.push(...licenseFiles(file,base));
  else if(/license|copying|copyright|notice|authors|contributors|patents/i.test(entry.name))result.push(path.relative(base,file));
 }
 return result;
}
for(const [relative,meta]of Object.entries(lock.packages)){
 if(!relative||meta.dev||!fs.existsSync(path.join(root,relative,'package.json')))continue;
 const source=path.join(root,relative);
 const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
 const target=path.join(output,'npm',relative);
 fs.mkdirSync(target,{recursive:true});
 const files=licenseFiles(source);
 for(const name of files){const dest=path.join(target,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(source,name),dest);}
 fs.copyFileSync(path.join(source,'package.json'),path.join(target,'package.json'));
 if(files.length===0){
  const extra=supplemental[pkg.name];
  if(!extra||!fs.existsSync(path.join(root,extra)))throw Error(`Missing license: ${pkg.name}@${pkg.version}`);
  fs.copyFileSync(path.join(root,extra),path.join(target,'LICENSE'));files.push('LICENSE');
 }
 // Tracing does not copy notices. Restore them next to each shipped package.
 const shipped=path.join(root,'dist-pack/server',relative);
 if(fs.existsSync(path.join(shipped,'package.json'))){
  for(const name of files){const dest=path.join(shipped,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(target,name),dest);}
 }
 inventory.push({name:pkg.name,version:pkg.version,license:pkg.license,path:relative,repository:pkg.repository,notices:files});
}
fs.writeFileSync(path.join(output,'npm-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
fs.cpSync(path.join(root,'third-party/upstream'),path.join(output,'upstream'),{recursive:true});
fs.copyFileSync(path.join(root,'docs/third-party-licenses.md'),path.join(output,'README.md'));
const nodeVersion=execFileSync(path.join(root,'dist-pack/node',process.platform==='win32'?'node.exe':'bin/node'),['-p','process.versions.node'],{encoding:'utf8'}).trim();
const nodeLicense=path.join(root,'third-party/upstream',`node-${nodeVersion}`,'LICENSE');
if(!fs.existsSync(nodeLicense)){
 const response=await fetch(`https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`);
 if(!response.ok)throw Error(`Missing Node ${nodeVersion} LICENSE`);
 fs.mkdirSync(path.dirname(nodeLicense),{recursive:true});fs.writeFileSync(nodeLicense,await response.text());
}
fs.copyFileSync(nodeLicense,path.join(root,'dist-pack/node/LICENSE'));
fs.copyFileSync(nodeLicense,path.join(output,'NODE-LICENSE'));
const sources=process.argv[2];
if(sources){
 const entries=JSON.parse(fs.readFileSync(path.join(root,'third-party/windows-vips-sources.json'),'utf8'));
 for(const entry of entries){
  const archive=path.join(path.resolve(sources),entry.file);
  if(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==entry.sha256)throw Error('Unverified source archive: '+entry.file);
  const members=execFileSync('tar',['-tf',archive],{encoding:'utf8',maxBuffer:32*1024*1024}).split(/\r?\n/).filter(n=>n&&!n.endsWith('/')&&/(license|copying|copyright|notice|authors|contributors|patents)/i.test(n));
  // Only data archives pinned by the checked-in manifest are accepted.
  if(members.some(n=>n.startsWith('/')||n.split('/').includes('..')))throw Error('Unsafe license archive path');
  const target=path.join(output,'native-sources',entry.group,entry.name);
  fs.mkdirSync(target,{recursive:true});
  const links=new Map();
  for(const line of execFileSync('tar',['-tvf',archive],{encoding:'utf8',maxBuffer:32*1024*1024}).split(/\r?\n/)){
   if(line.startsWith('l')){const match=line.match(/\s(\S+) -> (.+)$/);if(match)links.set(match[1],path.posix.normalize(path.posix.join(path.posix.dirname(match[1]),match[2])));}
  }
  const regular=members.filter(member=>!links.has(member));
  if(regular.length)execFileSync('tar',['-xf',archive,'-C',target,...regular],{maxBuffer:32*1024*1024});
  for(const member of members.filter(member=>links.has(member))){
   let read=member;const seen=new Set();
   while(links.has(read)){if(seen.has(read))throw Error('License symlink loop');seen.add(read);read=links.get(read);}
   if(read.startsWith('/')||read.split('/').includes('..'))throw Error('Unsafe license target');
   const bytes=execFileSync('tar',['-xOf',archive,read],{maxBuffer:32*1024*1024});
   const dest=path.join(target,member);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);
  }
 }
}
console.log(`Prepared notices for ${inventory.length} production packages, Node and native image libraries`);
