import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'dist-pack/licenses');fs.mkdirSync(out,{recursive:true});
const download=(url,to)=>{
  fs.mkdirSync(path.dirname(to),{recursive:true});
  if(/\.(tar\.(gz|xz|bz2)|tgz)$/.test(to)&&fs.existsSync(to)){
    try{execFileSync('tar',['-tf',to],{stdio:'ignore'});return;}catch{/* Retry an incomplete download. */}
  }
  const gist=url.match(/^https:\/\/gist\.(?:github|githubusercontent)\.com\/[^/]+\/([^/]+)\/raw\/([^/]+)\/([^/]+)$/);
  if(gist){const data=JSON.parse(execFileSync('gh',['api',`gists/${gist[1]}/${gist[2]}`],{maxBuffer:16*1024*1024,timeout:60000}));const content=data.files[gist[3]]?.content;if(!content)throw new Error('Missing upstream patch');fs.writeFileSync(to,content);return;}
  const patch=url.match(/^https:\/\/patch-diff.githubusercontent.com\/raw\/([^/]+)\/([^/]+)\/pull\/(\d+)\.patch$/);
  if(patch){fs.writeFileSync(to,execFileSync('gh',['api',`repos/${patch[1]}/${patch[2]}/pulls/${patch[3]}`,'-H','Accept: application/vnd.github.patch'],{maxBuffer:16*1024*1024,timeout:60000}));return;}
  const commit=url.match(/^https:\/\/github.com\/([^/]+)\/([^/]+)\/commit\/([a-f0-9]+)\.patch$/);
  if(commit){fs.writeFileSync(to,execFileSync('gh',['api',`repos/${commit[1]}/${commit[2]}/commits/${commit[3]}`,'-H','Accept: application/vnd.github.patch'],{maxBuffer:16*1024*1024,timeout:60000}));return;}
  const release=url.match(/^https:\/\/github.com\/([^/]+)\/([^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/);
  if(release){try{execFileSync('gh',['release','download',release[3],'--repo',`${release[1]}/${release[2]}`,'--pattern',release[4],'--output',to,'--clobber'],{timeout:600000,stdio:'pipe'});return;}catch{/* Fall back to the public asset URL. */}}
  const archive=url.match(/^https:\/\/github.com\/([^/]+)\/([^/]+)\/archive\/(.+)\.tar\.gz$/);
  if(archive)url=`https://codeload.github.com/${archive[1]}/${archive[2]}/tar.gz/${archive[3]}`;
  const raw=url.match(/^https:\/\/raw.githubusercontent.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
  if(raw){
    try{const content=execFileSync('gh',['api',`repos/${raw[1]}/${raw[2]}/contents/${raw[4]}?ref=${raw[3]}`,'-H','Accept: application/vnd.github.raw+json'],{maxBuffer:16*1024*1024,timeout:60000});fs.writeFileSync(to,content);return;}catch{/* Unauthenticated builds use the public raw endpoint. */}
  }
  execFileSync('curl',['--silent','--show-error','--fail','--location','--retry','2','--connect-timeout','15','--max-time',/\.(tar\.(gz|xz|bz2)|tgz)$/.test(to)?'600':'90',url,'--output',to],{stdio:'pipe'});
};
for(const file of ['LICENSE','THIRD-PARTY-NOTICES.md'])fs.copyFileSync(path.join(root,file),path.join(out,file));
for(const file of ['LICENSE','LICENSES.chromium.html'])fs.copyFileSync(path.join(root,'node_modules/electron/dist',file),path.join(out,`Electron-${file}`));
const nodeVersion=process.env.RM_RUNTIME_NODE_VERSION||'20.15.1';
download(`https://raw.githubusercontent.com/nodejs/node/v${nodeVersion}/LICENSE`,path.join(out,'Node-LICENSE'));
const inventory=[];
const modules=path.join(root,'dist-pack/server/node_modules');
function collectPackage(source, relative, placement) {
  const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
  if(!pkg.name||!pkg.version||inventory.some(p=>p.path===relative))return;
  const dest=path.join(out,'npm',relative),notices=[];
  for(const name of fs.readdirSync(source))if(/^(licen[sc]e|copying|notice)([.-]|$)/i.test(name)||/^licenses$/i.test(name)){
    fs.mkdirSync(dest,{recursive:true});fs.cpSync(path.join(source,name),path.join(dest,name),{recursive:true});notices.push(name);
  }
  if(!notices.length&&pkg.name==='@next/env'){fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(path.join(root,'node_modules/next/license.md'),path.join(dest,'LICENSE'));notices.push('LICENSE');}
  if(!notices.length&&pkg.name==='client-only'){fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(path.join(root,'node_modules/react/LICENSE'),path.join(dest,'LICENSE'));notices.push('LICENSE');}
  if(!notices.length&&pkg.name.startsWith('@edge-runtime/')){download('https://raw.githubusercontent.com/vercel/edge-runtime/main/LICENSE.md',path.join(dest,'LICENSE'));notices.push('LICENSE');}
  const upstream={
    'boolbase':'https://raw.githubusercontent.com/fb55/boolbase/54811f01c797a6bb1c263183ae90b7dd627e0638/LICENSE',
    'drizzle-orm':`https://raw.githubusercontent.com/drizzle-team/drizzle-orm/${pkg.version}/LICENSE`,
    '@swc/counter':'https://raw.githubusercontent.com/swc-project/pkgs/2cbd4700aaa6c28da488aad098b150c22ba56ff1/packages/counter/LICENSE.txt',
  }[pkg.name];
  if(!notices.length&&upstream){download(upstream,path.join(dest,'LICENSE'));notices.push('LICENSE');}
  if(!notices.length&&pkg.name==='isarray'){fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(path.join(source,'README.md'),path.join(dest,'README-LICENSE.md'));notices.push('README-LICENSE.md');}
  if(!notices.length&&pkg.name.startsWith('@next/swc-')){fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(path.join(root,'node_modules/next/license.md'),path.join(dest,'LICENSE'));notices.push('LICENSE');}
  if(!notices.length&&pkg.name.startsWith('@napi-rs/canvas-')){fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(path.join(root,'node_modules/@napi-rs/canvas/LICENSE'),path.join(dest,'LICENSE'));notices.push('LICENSE');}
  inventory.push({name:pkg.name,version:pkg.version,license:pkg.license||'SEE UPSTREAM',repository:pkg.repository||pkg.homepage||null,notices,path:relative,placement});
}
function visit(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,entry.name);
    if(entry.isDirectory()){
      if(fs.existsSync(path.join(p,'package.json'))){
        const pkg=JSON.parse(fs.readFileSync(path.join(p,'package.json'),'utf8'));
        if(pkg.name&&pkg.version){
          const relative=path.relative(modules,p),original=path.join(root,'node_modules',relative);
          let source=p;
          if(fs.existsSync(path.join(original,'package.json'))&&JSON.parse(fs.readFileSync(path.join(original,'package.json'),'utf8')).version===pkg.version)source=original;
          collectPackage(source,relative,'standalone');
        }
      }
      visit(p);
    }
  }
}
visit(modules);
// Bundlers inline modules such as PDF.js, JSZip and Lucide into client/server chunks.
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
for(const [relative,pkg] of Object.entries(lock.packages)){
  if(!relative||pkg.dev||pkg.devOptional||!relative.startsWith('node_modules/'))continue;
  const source=path.join(root,relative),name=relative.slice('node_modules/'.length);
  if(name==='@img/sharp-wasm32'||/^next\/node_modules\/(?:sharp|@img\/)/.test(name))continue;
  if(fs.existsSync(path.join(source,'package.json')))collectPackage(source,name,'production-dependency (possibly bundled or tree-shaken)');
}
const missing=inventory.filter(p=>!p.notices.length&&!/^@img\/sharp-libvips-/.test(p.name));
if(missing.length)throw new Error(`Missing license texts: ${missing.map(p=>p.name).join(', ')}`);
const libvips=inventory.find(p=>/^@img\/sharp-libvips-/.test(p.name));
if(!libvips)throw new Error('No libvips package in standalone inventory');
const ref=`v${libvips.version}`;
download(`https://raw.githubusercontent.com/lovell/sharp-libvips/${ref}/THIRD-PARTY-NOTICES.md`,path.join(out,'libvips-NOTICES.md'));
libvips.licenseBundle=['libvips-NOTICES.md','native-sources/'];
fs.writeFileSync(path.join(out,'dependencies.json'),JSON.stringify(inventory,null,2));
const electronVersion=fs.readFileSync(path.join(root,'node_modules/electron/dist/version'),'utf8').trim();
download(`https://raw.githubusercontent.com/electron/electron/v${electronVersion}/DEPS`,path.join(out,'Electron-DEPS'));
const electronDeps=fs.readFileSync(path.join(out,'Electron-DEPS'),'utf8');
const chromiumVersion=electronDeps.match(/'chromium_version':\s*'([^']+)'/)?.[1],electronNode=electronDeps.match(/'node_version':\s*'([^']+)'/)?.[1];
if(!chromiumVersion||!electronNode)throw new Error('Electron source versions missing');
download(`https://raw.githubusercontent.com/chromium/chromium/${chromiumVersion}/DEPS`,path.join(out,'Chromium-DEPS'));
const ffmpegRevision=fs.readFileSync(path.join(out,'Chromium-DEPS'),'utf8').match(/'ffmpeg_revision':\s*'([a-f0-9]+)'/)?.[1];
if(!ffmpegRevision)throw new Error('Chromium FFmpeg revision missing');
fs.writeFileSync(path.join(out,'SOURCE-ACCESS.md'),`# Corresponding Source\n\nVersion: sharp-libvips ${ref}.\nThe release provides Third-Party-Sources-${ref}.zip next to the DMG.\nSource archives, upstream build scripts, versions and patch files are included.\nRebuild: https://github.com/lovell/sharp-libvips/tree/${ref}\nThe shared libvips library is located in Resources/server/node_modules/${libvips.path}/lib/.\nReplacement and reverse engineering to debug modifications of LGPL components are permitted.\nElectron sources and patches: https://github.com/electron/electron/tree/v${electronVersion}\nElectron build instructions: https://github.com/electron/electron/blob/v${electronVersion}/docs/development/build-instructions-macos.md\nElectron DEPS pins Chromium ${chromiumVersion} and Node ${electronNode}.\nChromium DEPS: https://github.com/chromium/chromium/blob/${chromiumVersion}/DEPS\nFFmpeg source: https://chromium.googlesource.com/chromium/third_party/ffmpeg/+/${ffmpegRevision}\nFFmpeg archive: https://chromium.googlesource.com/chromium/third_party/ffmpeg/+archive/${ffmpegRevision}.tar.gz\nBackend Node sources: https://github.com/nodejs/node/tree/v${nodeVersion}\n`);
console.log(`License materials: ${inventory.length} installed runtime package records -> ${out}`);

if(process.argv.includes('--sources')){
  const dest=path.join(root,'dist-pack/source-materials');fs.mkdirSync(dest,{recursive:true});
  const build=path.join(dest,`sharp-libvips-${libvips.version}.tar.gz`);
  download(`https://github.com/lovell/sharp-libvips/archive/refs/tags/${ref}.tar.gz`,build);
  execFileSync('tar',['-xf',build,'-C',dest]);
  const source=path.join(dest,`sharp-libvips-${libvips.version}`);
  const props=Object.fromEntries(fs.readFileSync(path.join(source,'versions.properties'),'utf8').split('\n').filter(l=>/^VERSION_\w+=/.test(l)).map(l=>{const [key,...value]=l.split('=');return [key,value.join('=').replace(/['"]/g,'')];}));
  const script=fs.readFileSync(path.join(source,'build/posix.sh'),'utf8');
  const expanded=script.replace(/\$\(without_patch \$(VERSION_\w+)\)/g,(_,v)=>props[v].replace(/\.\d+$/,'')).replace(/\$\(without_prerelease \$(VERSION_\w+)\)/g,(_,v)=>props[v].replace(/-[\w]+$/,'')).replace(/\$\{(VERSION_\w+)\/\/\.\/([-_])\}/g,(_,v,separator)=>props[v].replaceAll('.',separator)).replace(/\$\{(VERSION_\w+)\}/g,(_,v)=>props[v]);
  const urls=[...expanded.matchAll(/\$CURL (https:\/\/\S+)/g)].map(m=>m[1]).map(url=>{
    // HarfBuzz's official release tarball includes the same tagged source plus generated build files.
    const harfbuzz=url.match(/^https:\/\/github.com\/harfbuzz\/harfbuzz\/archive\/([^/]+)\.tar\.gz$/);
    return harfbuzz?`https://github.com/harfbuzz/harfbuzz/releases/download/${harfbuzz[1]}/harfbuzz-${harfbuzz[1]}.tar.xz`:url;
  });
  const records=[];
  for(const [i,url] of [...new Set(urls)].entries()){
    if(url.includes('$'))throw new Error(`Unresolved source URL: ${url}`);
    const file=path.join(dest,'archives',`${String(i).padStart(2,'0')}-${path.basename(new URL(url).pathname)}`);
    console.log(`Source ${i+1}/${urls.length}: ${url}`);download(url,file);
    records.push({url,file:path.relative(dest,file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
    if(/\.(tar\.(gz|xz|bz2)|tgz)$/.test(file)){
      const names=execFileSync('tar',['-tf',file],{encoding:'utf8',maxBuffer:16*1024*1024}).split('\n').filter(Boolean);
      if(names.some(n=>n.startsWith('/')||n.split('/').includes('..')))throw new Error(`Unsafe source archive ${file}`);
      const notices=names.filter(n=>(/^(licen[sc]e|copying|copyright|notice|authors|patents|ftl)([._-]|$)/i.test(path.basename(n))||/(^|\/)LICENSES\//i.test(n))&&!n.endsWith('/'));
      if(notices.length){
        const extract=path.join(dest,'license-files',String(i));fs.rmSync(extract,{recursive:true,force:true});fs.mkdirSync(extract,{recursive:true});
        execFileSync('tar',['-xf',file,'-C',extract,...notices]);
        const native=path.join(out,'native-sources',String(i));fs.rmSync(native,{recursive:true,force:true});fs.cpSync(extract,native,{recursive:true,dereference:true});
      }
    }
  }
  fs.copyFileSync(path.join(out,'libvips-NOTICES.md'),path.join(dest,'THIRD-PARTY-NOTICES.md'));
  const charset=path.join(dest,'javascript/jschardet');
  fs.rmSync(charset,{recursive:true,force:true});
  fs.cpSync(path.join(root,'node_modules/jschardet'),charset,{recursive:true});
  fs.writeFileSync(path.join(dest,'REBUILD.md'),`# Rebuilding Third-Party Components\n\nNative image libraries: use the included sharp-libvips-${libvips.version}/build scripts, version pins and patches.\nJavaScript: javascript/jschardet contains the complete installed LGPL-2.1-or-later source package.\nThe app source is published at https://github.com/JerryDoko/Resources_manager.\nRun npm ci in that source, replace node_modules/jschardet/lib with your modified version, then npm run release:mac to rebuild the application.\nThe app does not prohibit replacement or reverse engineering for debugging modifications to LGPL components.\n`);
  fs.writeFileSync(path.join(dest,'sources.json'),JSON.stringify(records,null,2));
  const used=new Set(records.map(record=>path.basename(record.file)));
  for(const name of fs.readdirSync(path.join(dest,'archives')))if(!used.has(name))fs.rmSync(path.join(dest,'archives',name),{recursive:true,force:true});
  const zip=path.join(root,'release',`Third-Party-Sources-${ref}.zip`);fs.mkdirSync(path.dirname(zip),{recursive:true});
  execFileSync('ditto',['-c','-k','--keepParent',dest,zip]);console.log(zip);
}
