import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPerformance, normalizePerformance, performanceFile, savePerformance, threadLimit } from "../../src/lib/novel/performance-settings";
import { findModelDirectory, installRuntime, installEngine } from "../../src/lib/novel/runtime-install";
import { kokoroStatus } from "../../src/lib/novel/tts-service";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rm-performance-tests-"));
process.env.RESOURCES_MANAGER_DATA = path.join(temp, "data");
after(() => fs.rmSync(temp, { recursive: true, force: true }));
test("性能模式受 CPU 上限限制，自定义仅接受范围内整数", () => {
  const limit = threadLimit(); assert.ok(limit >= 1 && limit <= 32);
  assert.deepEqual(normalizePerformance({ mode: "low" }), { mode: "low", threads: 1 });
  assert.equal(normalizePerformance({ mode: "balanced" }).threads, Math.min(2, limit));
  assert.equal(normalizePerformance({ mode: "speed" }).threads, Math.min(4, limit));
  for (const threads of [0, -1, 1.5, limit + 1, "2", null]) assert.throws(() => normalizePerformance({ mode: "custom", threads }));
  assert.throws(() => normalizePerformance({ mode: "unknown" }));
  assert.throws(() => normalizePerformance(null));
  assert.equal(normalizePerformance({ mode: "custom", threads: limit }).threads, limit);
});
test("性能设置在用户数据根目录持久化，损坏文件回退到均衡", () => {
  assert.equal(getPerformance().mode, "balanced");
  savePerformance({ mode: "low" }); assert.deepEqual(getPerformance(), { mode: "low", threads: 1 });
  assert.equal(path.dirname(performanceFile()), path.join(temp, "data"));
  assert.throws(() => savePerformance({ mode: "custom", threads: 33 }));
  assert.equal(getPerformance().mode, "low");
  fs.writeFileSync(performanceFile(), "invalid"); assert.equal(getPerformance().mode, "balanced");
});
test("模型目录不依赖 catalog，识别解压包、model 子目录并拒绝 Books", () => {
  const books = path.join(temp, "Books"); fs.mkdirSync(books); fs.writeFileSync(path.join(books, "catalog.json"), "{}");
  assert.throws(() => findModelDirectory(books), /catalog.json/);
  assert.throws(() => findModelDirectory("relative")); assert.throws(() => findModelDirectory({}));
  const full = path.join(temp, "download", "kokoro-multi-lang-v1_1"); fs.mkdirSync(full, { recursive: true }); fs.writeFileSync(path.join(full, "model.onnx"), "fixture");
  assert.equal(findModelDirectory(path.dirname(full)), full); assert.equal(findModelDirectory(full), full);
  const bundle = path.join(temp, "bundle", "model"); fs.mkdirSync(bundle, { recursive: true }); fs.writeFileSync(path.join(bundle, "model.int8.onnx"), "fixture");
  assert.equal(findModelDirectory(path.dirname(bundle)), bundle);
});
test("公开包缺少引擎时拒绝模型导入，下载引擎必须显式确认",()=>{
  const root=process.env.RM_KOKORO_ROOT,installed=process.env.RM_KOKORO_INSTALL_ROOT;
  try{
    process.env.RM_KOKORO_ROOT=path.join(temp,"empty-runtime");process.env.RM_KOKORO_INSTALL_ROOT=path.join(temp,"empty-installed");
    assert.equal(kokoroStatus().engineAvailable,false);assert.equal(kokoroStatus().available,false);
    assert.throws(()=>installRuntime(temp),/先下载独立听书引擎/);assert.throws(()=>installEngine(false),/确认/);
  }finally{if(root===undefined)delete process.env.RM_KOKORO_ROOT;else process.env.RM_KOKORO_ROOT=root;if(installed===undefined)delete process.env.RM_KOKORO_INSTALL_ROOT;else process.env.RM_KOKORO_INSTALL_ROOT=installed;}
});
