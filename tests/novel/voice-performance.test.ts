import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveVoicePerformance, getVoicePerformance, updateVoicePerformance, getVoiceStorage } from "../../src/lib/novel/voice-performance";
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"rm-voice-settings-"));process.env.RM_KOKORO_INSTALL_ROOT=temp;
after(()=>fs.rmSync(temp,{recursive:true,force:true}));
test("低核心电脑限流，线程数越界和小数被拒绝",()=>{
  assert.equal(resolveVoicePerformance({mode:"fast"},1).threads,1);
  assert.equal(resolveVoicePerformance({mode:"fast"},16).threads,4);
  assert.throws(()=>resolveVoicePerformance({mode:"custom",threads:0},16));
  assert.throws(()=>resolveVoicePerformance({mode:"custom",threads:17},16));
  assert.throws(()=>resolveVoicePerformance({mode:"custom",threads:1.5},16));
});
test("性能设置保存可重读，损坏文件恢复默认均衡模式",()=>{
  updateVoicePerformance({mode:"quiet"});assert.equal(getVoicePerformance().threads,1);
  updateVoicePerformance({mode:"custom",threads:1});assert.equal(getVoicePerformance().mode,"custom");
  fs.writeFileSync(path.join(temp,"performance.json"),"invalid");assert.equal(getVoicePerformance().mode,"balanced");
});
test("模型存放目录持久化并枚举文件夹，排除压缩包和其他文件",()=>{
  const storage=getVoiceStorage();assert.ok(fs.statSync(storage.directory).isDirectory());
  fs.mkdirSync(path.join(storage.directory,"kokoro-multi-lang-v1_1"));fs.writeFileSync(path.join(storage.directory,"model.tar.bz2"),"");
  assert.deepEqual(getVoiceStorage().packages.map(p=>p.name),["kokoro-multi-lang-v1_1"]);
  assert.match(storage.guide,/github.com\/JerryDoko\/Resources_manager/);
});
