import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";

export type PerformanceMode = "low" | "balanced" | "speed" | "custom";
export type PerformanceSettings = { mode: PerformanceMode; threads: number };
export function threadLimit() { return Math.max(1, Math.min(32, os.availableParallelism?.() || os.cpus().length)); }
export function normalizePerformance(value: unknown): PerformanceSettings {
  const input = value as Partial<PerformanceSettings> | null;
  const mode = input?.mode;
  if (!mode || !["low", "balanced", "speed", "custom"].includes(mode)) throw new Error("请选择有效的性能模式");
  const limit = threadLimit();
  if (mode === "custom" && (!Number.isInteger(input.threads) || input.threads! < 1 || input.threads! > limit)) throw new Error(`CPU 线程必须为 1 到 ${limit}`);
  return { mode, threads: mode === "custom" ? input!.threads! : Math.min(limit, { low: 1, balanced: 2, speed: 4 }[mode]) };
}
export function performanceFile() { return path.join(process.env.RESOURCES_MANAGER_DATA || path.join(process.cwd(), "data"), "novel-performance.json"); }
export function getPerformance(): PerformanceSettings {
  try { return normalizePerformance(JSON.parse(fs.readFileSync(performanceFile(), "utf8"))); }
  catch { return normalizePerformance({ mode: "balanced" }); }
}
export function savePerformance(value: unknown) {
  const settings = normalizePerformance(value), file = performanceFile(), temporary = `${file}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(temporary, JSON.stringify(settings, null, 2)); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
  return settings;
}
