import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
test('声音包安装和打包拒绝嵌套的旧引擎组件',async()=>{
 const {assertVoiceRuntime}=await import(pathToFileURL(path.resolve('runtime/kokoro/runtime-safety.mjs')).href);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rm-runtime-safety-'));
 try{
  fs.mkdirSync(path.join(root,'python','lib'),{recursive:true});
  fs.writeFileSync(path.join(root,'python','lib','onnxruntime.dll'),'test fixture');
  assert.doesNotThrow(()=>assertVoiceRuntime(root));
  for(const filename of ['sherpa_onnx.dll','eSpeak-NG','piper-phonemize']){
   const file=path.join(root,'python','lib',filename);fs.writeFileSync(file,'test fixture');
   assert.throws(()=>assertVoiceRuntime(root),/旧 GPL 引擎/);fs.unlinkSync(file);
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
