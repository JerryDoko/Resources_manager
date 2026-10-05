import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { createInterface } from "readline";

export type BenchmarkResult = { loadSeconds: number; elapsed: number; duration: number; rtf: number; threads: number; speakers: number };
type Paths = { python: string; worker: string; model: string };
export async function probeWorker(paths: Paths, threads: number, benchmark = false): Promise<BenchmarkResult> {
  const cache = await fs.promises.mkdtemp(path.join(os.tmpdir(), "rm-kokoro-probe-"));
  try {
    return await new Promise<BenchmarkResult>((resolve, reject) => {
      const child = spawn(paths.python, ["-u", paths.worker, "--model", paths.model, "--cache", cache, "--threads", String(threads), benchmark ? "--benchmark" : "--check"], {
        windowsHide: true, env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
      });
      let result: BenchmarkResult | undefined, failure: Error | undefined;
      const timer = setTimeout(() => { failure = new Error("声音模型测试超时"); child.kill(); }, 180000);
      const lines = createInterface({ input: child.stdout });
      lines.on("line", line => {
        try {
          const data = JSON.parse(line);
          if (data.error) failure = new Error(data.error);
          if (data.checked || data.benchmark) result = { loadSeconds: data.loadSeconds, elapsed: data.elapsed || 0, duration: data.duration || 0, rtf: data.duration ? data.elapsed / data.duration : 0, threads, speakers: data.speakers };
        } catch { /* Ignore native diagnostic lines without exposing text or local paths. */ }
      });
      child.stderr.resume();
      child.once("error", error => { clearTimeout(timer); lines.close(); reject(error); });
      child.once("close", code => {
        clearTimeout(timer); lines.close();
        if (failure) reject(failure);
        else if (code !== 0 || !result || result.speakers !== 103) reject(new Error("声音包不兼容，请选择 sherpa-onnx Kokoro v1.1 中英模型（103 个音色）"));
        else resolve(result);
      });
    });
  } finally { await fs.promises.rm(cache, { recursive: true, force: true }); }
}
