import { kokoroPaths, kokoroStatus } from "./tts-service";
import { normalizePerformance } from "./performance-settings";
import { probeWorker } from "./worker-probe";

const state = globalThis as typeof globalThis & { rmNovelBenchmark?: boolean };
export const benchmarkRunning = () => !!state.rmNovelBenchmark;
export async function benchmarkPerformance(value: unknown) {
  const settings = normalizePerformance(value);
  if (benchmarkRunning()) throw new Error("速度测试正在进行");
  if (!kokoroStatus().available) throw new Error("请先安装听书声音包");
  state.rmNovelBenchmark = true;
  try { return { ...await probeWorker(kokoroPaths(), settings.threads, true), mode: settings.mode }; }
  finally { state.rmNovelBenchmark = false; }
}
