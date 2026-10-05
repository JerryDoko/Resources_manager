import path from "path";
import fs from 'node:fs';
import { spawn } from "child_process";
import { createInterface } from "readline";
import { kokoroPaths, kokoroStatus, tts } from "./tts-service";
import voiceModels from "../../../runtime/kokoro/models.json";

type Progress = { running: boolean; phase: string; done: number; total: number; error: string; modelId: string };
const state = globalThis as typeof globalThis & { rmRuntimeInstall?: Progress };
export const installation = () => state.rmRuntimeInstall ||= { running: false, phase: "", done: 0, total: 0, error: "", modelId: "kokoro-v1.1-int8" };
export const availableVoiceModels = () => voiceModels.map(({ id, name, description, size, url }) => ({ id, name, description, size, url }));

export function installRuntime(directory?: string, modelId = "kokoro-v1.1-int8") {
  if (!voiceModels.some(model => model.id === modelId)) throw new Error("未知语音模型");
  if (directory !== undefined && (typeof directory !== "string" || !directory.trim())) throw new Error("请选择离线声音包目录");
  const installer = path.join(kokoroPaths().root, 'install.mjs');
  if (!fs.existsSync(installer)) throw new Error(`应用缺少声音安装脚本：${installer}。请重新准备桌面资源或重新安装应用。`);
  const p = installation();
  if (p.running) throw new Error("声音包正在安装");
  Object.assign(p, { running: true, phase: "准备安装", done: 0, total: 0, error: "", modelId });
  const root = process.env.RM_KOKORO_INSTALL_ROOT || path.join(process.env.RESOURCES_MANAGER_DATA || path.join(process.cwd(), "data"), "kokoro-runtime");
  const dest = path.join(root, "bundle", `${process.platform}-${process.arch}`);
  tts().stop();
  const args = [installer, "--dest", dest, "--model", modelId];
  if (directory) args.push("--from", directory);
  const child = spawn(process.execPath, args, { windowsHide: true, env: { ...process.env, PYTHONUTF8: "1", PYTHONDONTWRITEBYTECODE: "1" } });
  const lines = createInterface({ input: child.stdout });
  let diagnostics = "";
  child.stderr.on("data", chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-2000); });
  lines.on("line", line => {
    try {
      const progress = JSON.parse(line);
      if (typeof progress.phase === "string") p.phase = progress.phase;
      if (typeof progress.done === "number") p.done = progress.done;
      if (typeof progress.total === "number") p.total = progress.total;
      if (typeof progress.error === "string") p.error = progress.error;
    } catch { /* Only JSON progress is exposed to the UI. */ }
  });
  const fail = (error: string) => { p.error = error; p.phase = "安装失败，可重试"; p.running = false; lines.close(); };
  child.once("error", e => fail(`启动声音安装脚本失败: ${e.message}`));
  child.once("exit", code => {
    if (code !== 0 || !kokoroStatus().available) fail(p.error || diagnostics || "声音包安装不完整，请重试");
    else { p.phase = "安装完成"; p.running = false; lines.close(); }
  });
  return p;
}
