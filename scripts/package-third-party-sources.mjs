import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import JSZip from 'jszip';
const source=path.resolve(process.argv[2]||'dist-pack/third-party-sources');
const work=path.resolve(process.argv[3]||'../work');
const output=path.resolve(process.argv[4]||'release/Resources-Manager-1.1.12-windows-third-party-sources.zip');
const entries=JSON.parse(fs.readFileSync('third-party/windows-vips-sources.json','utf8'));
const zip=new JSZip();
for(const entry of entries){
 const bytes=fs.readFileSync(path.join(source,entry.file));
 if(crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Unverified source: '+entry.file);
 zip.file(entry.file,bytes);
}
zip.file('sources.json',JSON.stringify(entries,null,2)+'\n');
const trees=[['vips-build-8.18.3','bca68727eb1df12c5d2b204a13a392989d505774','https://github.com/libvips/build-win64-mxe.git'],['vips-build-8.15.3','953ed027e18ac38f3cb388d2290fd84cdee15cfb','https://github.com/libvips/build-win64-mxe.git'],['mxe-20260605','d973945bb92c7783d5afa41bb2b8d2e1a04eaba3','https://github.com/kleisauke/mxe.git'],['mxe-202408','e56eebec2a9f578c12a495851a76256d93b71ac0','https://github.com/mxe/mxe.git']];
const treeVersions=[];
for(const [name,ref,url]of trees){
 const cwd=path.join(work,name);
 if(!fs.existsSync(cwd)){fs.mkdirSync(work,{recursive:true});execFileSync('git',['clone','--no-checkout',url,cwd],{stdio:'inherit'});}
 const commit=execFileSync('git',['rev-parse',ref],{cwd,encoding:'utf8'}).trim();
 zip.file(`build/${name}.tar.gz`,execFileSync('git',['archive','--format=tar.gz',`--prefix=${name}/`,commit],{cwd,maxBuffer:64*1024*1024}));
 treeVersions.push({name,commit});
}
zip.file('build/commits.json',JSON.stringify(treeVersions,null,2)+'\n');
function addTree(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name==='node_modules'||e.name==='.git'||e.isSymbolicLink())continue;const p=path.join(dir,e.name),target=prefix+'/'+e.name;if(e.isDirectory())addTree(p,target);else zip.file(target,fs.readFileSync(p));}}
for(const [directory,name]of [['node_modules/jschardet','jschardet-3.1.4'],['node_modules/sharp','sharp-0.35.3'],['node_modules/next/node_modules/sharp','sharp-0.33.5']])addTree(directory,'javascript/'+name);
addTree('third-party/upstream','notices');
zip.file('REBUILD.md',fs.readFileSync('third-party/REBUILD.md'));
fs.mkdirSync(path.dirname(output),{recursive:true});
await new Promise((resolve,reject)=>zip.generateNodeStream({type:'nodebuffer',streamFiles:true,compression:'STORE'}).pipe(fs.createWriteStream(output)).on('finish',resolve).on('error',reject));
console.log(output+' ('+fs.statSync(output).size+' bytes)');
