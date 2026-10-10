import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {pcmWave,WavWriter} from "../../src/lib/novel/wav-export";
function wave(rate=24000){const data=Buffer.alloc(48);data.write("RIFF");data.writeUInt32LE(40,4);data.write("WAVEfmt ",8);data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write("data",36);data.writeUInt32LE(4,40);data.writeInt16LE(100,44);data.writeInt16LE(-100,46);return data;}
test("WAV 拼接保留 PCM 与采样率，更新长度且不修改缓存",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"rm-wav-test-"));let writer:WavWriter|undefined;
  try{const source=path.join(dir,"chunk.wav"),output=path.join(dir,"chapter.wav"),original=wave();fs.writeFileSync(source,original);writer=new WavWriter(output);writer.append(source);writer.append(source);assert.equal(writer.finish(),52);const result=fs.readFileSync(output);assert.equal(result.readUInt32LE(4),44);assert.equal(result.readUInt32LE(40),8);assert.equal(result.readUInt32LE(24),24000);assert.deepEqual(pcmWave(result).pcm,Buffer.concat([original.subarray(44),original.subarray(44)]));assert.deepEqual(fs.readFileSync(source),original);}finally{writer?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test("拒绝损坏、压缩音频与不同采样格式",()=>{
  assert.throws(()=>pcmWave(Buffer.from("bad")));assert.throws(()=>pcmWave(wave().subarray(0,45)));const compressed=wave();compressed.writeUInt16LE(3,20);assert.throws(()=>pcmWave(compressed));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"rm-wav-test-")),writer=new WavWriter(path.join(dir,"out.wav"));
  try{const one=path.join(dir,"one.wav"),two=path.join(dir,"two.wav");fs.writeFileSync(one,wave());fs.writeFileSync(two,wave(16000));writer.append(one);assert.throws(()=>writer.append(two),/格式不一致/);}finally{writer.close();fs.rmSync(dir,{recursive:true,force:true});}
});
