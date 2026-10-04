import fs from "fs";
import path from "path";
import os from "os";
import { randomUUID } from "crypto";

export const VOICE_GUIDE_URL = "https://github.com/JerryDoko/Resources_manager/blob/main/docs/windows-voice-setup.md";
export const voiceHome = () => process.env.RM_KOKORO_INSTALL_ROOT || path.join(process.env.RESOURCES_MANAGER_DATA || path.join(process.cwd(), "data"), "kokoro-runtime");
export type VoiceMode = "quiet" | "balanced" | "fast" | "custom";
export function resolveVoicePerformance(value: { mode?: unknown; threads?: unknown } = {}, cores = os.availableParallelism()) {
  const maxThreads = Math.max(1, Math.min(32, cores));
  const mode = value.mode ?? "balanced";
  if (!["quiet", "balanced", "fast", "custom"].includes(String(mode))) throw new Error("未知听书性能模式");
  if (value.threads !== undefined && (!Number.isInteger(value.threads) || Number(value.threads) < 1 || Number(value.threads) > maxThreads)) throw new Error(`线程数应为 1–${maxThreads} 的整数`);
  if (mode === "custom" && value.threads === undefined) throw new Error("请选择自定义线程数");
  const threads = mode === "custom" ? Number(value.threads) : Math.min(maxThreads, mode === "quiet" ? 1 : mode === "fast" ? 4 : 2);
  return { mode: mode as VoiceMode, threads, maxThreads, cores, memoryGB: Math.round(os.totalmem() / 1024 ** 3) };
}
export function getVoicePerformance() {
  try { return resolveVoicePerformance(JSON.parse(fs.readFileSync(path.join(voiceHome(), "performance.json"), "utf8"))); }
  catch { return resolveVoicePerformance(); }
}
export function updateVoicePerformance(value: { mode?: unknown; threads?: unknown }) {
  const settings = resolveVoicePerformance(value), root = voiceHome();
  fs.mkdirSync(root, { recursive: true });
  const temporary = path.join(root, `performance-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify({ mode: settings.mode, threads: settings.mode === "custom" ? settings.threads : undefined }));
    fs.renameSync(temporary, path.join(root, "performance.json"));
  } finally { fs.rmSync(temporary, { force: true }); }
  return settings;
}
export function getVoiceStorage() {
  const directory = path.join(voiceHome(), "models");
  fs.mkdirSync(directory, { recursive: true });
  const packages = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => ({ name: entry.name, path: path.join(directory, entry.name) }));
  return { directory, packages, guide: VOICE_GUIDE_URL };
}
