import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const installer = import(pathToFileURL(path.join(process.cwd(), "runtime/kokoro/install.mjs")).href);
const inspectVoiceSource = async (directory: string) => (await installer).inspectVoiceSource(directory);
const temp = mkdtempSync(path.join(os.tmpdir(), "rm-model-source-"));
after(() => fs.rm(temp, { recursive: true, force: true }));
async function model(dir: string, onnx = "model.onnx") {
  await fs.mkdir(dir, { recursive: true });
  for (const name of [onnx, "voices.bin", "tokens.txt", "lexicon-us-en.txt", "lexicon-zh.txt", "LICENSE"]) await fs.writeFile(path.join(dir, name), "fixture");
}
test("官方模型同名嵌套目录可识别，兼容带引号的 Windows 路径", async () => {
  const outer = path.join(temp, "kokoro-multi-lang-v1_1"), inner = path.join(outer, "kokoro-multi-lang-v1_1");
  await model(inner);
  assert.deepEqual(await inspectVoiceSource(`"${outer}"`), { kind: "model", source: inner, modelId: "kokoro-v1.1-fp32" });
  assert.equal((await inspectVoiceSource(inner)).source, inner);
});
test("本地模型版本按文件识别，不误用在线选择的版本", async () => {
  const dir = path.join(temp, "int8"); await model(dir, "model.int8.onnx");
  assert.equal((await inspectVoiceSource(dir)).modelId, "kokoro-v1.1-int8");
});
test("不完整模型和多个 ONNX 文件给出可操作的错误", async () => {
  const dir = path.join(temp, "incomplete"); await model(dir); await fs.unlink(path.join(dir, "tokens.txt"));
  await assert.rejects(() => inspectVoiceSource(dir), /缺少 tokens.txt/);
  await fs.writeFile(path.join(dir, "second.onnx"), "fixture");
  await assert.rejects(() => inspectVoiceSource(dir), /多个 ONNX/);
});
test("完整包优先使用自身校验清单，不把校验失败的包当作裸模型", async () => {
  const dir = path.join(temp, "full"); await model(path.join(dir, "model"));
  await fs.writeFile(path.join(dir, "manifest.json"), "{}");
  assert.deepEqual(await inspectVoiceSource(dir), { kind: "bundle", source: dir, manifestFile: path.join(dir, "manifest.json") });
});
test("选错目录时不再误套完整包清单并报 model/LICENSE 不存在", async () => {
  const dir = path.join(temp, "empty"); await fs.mkdir(dir);
  await assert.rejects(() => inspectVoiceSource(dir), /未找到模型/);
});
