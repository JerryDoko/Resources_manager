#!/usr/bin/env node
/**
 * 准备桌面端打包资源：
 * 1. next build (standalone)
 * 2. 拷贝 static / public 进 standalone
 * 3. 下载固定版本的目标平台 Node 运行时
 */
import { execFileSync, execSync } from "child_process";
import fs from "fs";
import path from "path";
import https from "https";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist-pack");
const SERVER_OUT = path.join(DIST, "server");
const NODE_OUT = path.join(DIST, "node");
const RUNTIME_NODE_VERSION = process.env.RM_RUNTIME_NODE_VERSION || process.versions.node;
const NEXT_DIST = ".next-pack";

const CONNECT_TIMEOUT_MS = 10_000;

function rmrf(p) {
  const resolved = path.resolve(p);
  const relative = path.relative(DIST, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`拒绝清理打包目录外的路径: ${resolved}`);
  fs.rmSync(resolved, { recursive: true, force: true });
}

function cpRecursive(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function fetchWithTimeout(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: CONNECT_TIMEOUT_MS }, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        res.resume();
        fetchWithTimeout(res.headers.location).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败 ${url}: HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      resolve(res);
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`连接超时 (${CONNECT_TIMEOUT_MS}ms): ${url}`));
    });
    req.on("error", reject);
  });
}

async function downloadToFile(url, destFile) {
  const res = await fetchWithTimeout(url);
  res.setTimeout(0);
  await pipeline(res, createWriteStream(destFile));
}

async function downloadNode(arch) {
  const version = RUNTIME_NODE_VERSION;
  const platform = process.platform === "win32" ? "win" : process.platform;
  if (!["darwin", "win"].includes(platform)) {
    throw new Error(`暂不支持在 ${process.platform} 上准备桌面包`);
  }
  const name = `node-v${version}-${platform}-${arch}`;
  const archiveExtension = platform === "win" ? "zip" : "tar.gz";
  const url = `https://nodejs.org/dist/v${version}/${name}.${archiveExtension}`;
  const destDir = path.join(DIST, "node-download");
  const archive = path.join(DIST, `${name}.${archiveExtension}`);
  const outputBin =
    platform === "win"
      ? path.join(NODE_OUT, "node.exe")
      : path.join(NODE_OUT, "bin", "node");

  if (version === process.versions.node && arch === process.arch) {
    fs.mkdirSync(path.dirname(outputBin), { recursive: true });
    fs.copyFileSync(process.execPath, outputBin);
    console.log(`[pack] 复用当前 Node ${version}，保持 SQLite ABI 一致`);
    return;
  }

  if (fs.existsSync(outputBin)) {
    try {
      const currentVersion = execFileSync(outputBin, ["-p", "process.version"], {
        encoding: "utf8",
      }).trim();
      if (currentVersion === `v${version}`) {
        console.log(`[pack] 复用 Node ${version} (${arch}) → ${NODE_OUT}`);
        return;
      }
    } catch {
      /* replace an invalid cached runtime */
    }
  }

  rmrf(destDir);
  fs.mkdirSync(destDir, { recursive: true });

  console.log(`[pack] 下载 Node ${version} (${arch}) …`);
  console.log(`[pack] ${url}`);
  await downloadToFile(url, archive);

  execFileSync(
    "tar",
    platform === "win"
      ? ["-xf", archive, "-C", destDir]
      : ["-xzf", archive, "-C", destDir],
    { stdio: "inherit" }
  );
  fs.unlinkSync(archive);

  const extracted = path.join(destDir, name);
  const nodeBin =
    platform === "win"
      ? path.join(extracted, "node.exe")
      : path.join(extracted, "bin", "node");
  if (!fs.existsSync(nodeBin)) {
    throw new Error(`Node 解压后缺少 bin/node: ${extracted}`);
  }

  rmrf(NODE_OUT);
  fs.mkdirSync(path.dirname(outputBin), { recursive: true });
  fs.copyFileSync(nodeBin, outputBin);
  if (platform !== "win") fs.chmodSync(outputBin, 0o755);
  rmrf(destDir);
  console.log(`[pack] Node 已就绪 → ${NODE_OUT}`);
}

function verifyNativeRuntime() {
  const nodeBin =
    process.platform === "win32"
      ? path.join(NODE_OUT, "node.exe")
      : path.join(NODE_OUT, "bin", "node");
  const script = [
    'const Database = require("better-sqlite3");',
    'const db = new Database(":memory:");',
    'db.exec("CREATE TABLE healthcheck (id INTEGER PRIMARY KEY)");',
    "db.close();",
    'console.log(`[pack] better-sqlite3 自检通过 (Node ${process.version}, ABI ${process.versions.modules})`);',
  ].join("\n");
  execFileSync(nodeBin, ["-e", script], {
    cwd: SERVER_OUT,
    stdio: "inherit",
  });
}

function rebuildNativeModules() {
  if (RUNTIME_NODE_VERSION === process.versions.node) {
    try {
      execFileSync(process.execPath, ["-e", 'const D=require("better-sqlite3");new D(":memory:").close();require("sharp")'], { cwd: ROOT });
      console.log("[pack] 当前原生模块已通过运行时检查，无需重建");
      return;
    } catch { /* Install the matching native component below. */ }
  }
  const runtimeBinDir =
    process.platform === "win32" ? NODE_OUT : path.join(NODE_OUT, "bin");
  console.log(`[pack] 使用 Node ${RUNTIME_NODE_VERSION} 重建 better-sqlite3 …`);
  const command = process.platform === "win32"
    ? process.env.ComSpec || "cmd.exe"
    : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd", "rebuild", "better-sqlite3"]
    : ["rebuild", "better-sqlite3"];
  execFileSync(command, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      PATH: `${runtimeBinDir}${path.delimiter}${process.env.PATH || ""}`,
    },
    stdio: "inherit",
  });
}

function prepareStandalone() {
  console.log("[pack] next build …");
  execFileSync(process.execPath, [path.join(ROOT,"node_modules/next/dist/bin/next"), "build"], { cwd: ROOT, stdio: "inherit", env: { ...process.env, RM_NEXT_DIST_DIR: NEXT_DIST } });

  const standalone = path.join(ROOT, NEXT_DIST, "standalone");
  if (!fs.existsSync(standalone)) {
    throw new Error("未找到 .next/standalone，请确认 next.config output: standalone");
  }

  rmrf(SERVER_OUT);
  cpRecursive(standalone, SERVER_OUT);

  // 构建时可能落在 cwd 下的本地库数据，不要打进安装包
  rmrf(path.join(SERVER_OUT, "data"));
  // Voice resources are copied separately by afterPack. Tracing can include
  // both the bundle and its download cache through dynamic filesystem reads.
  rmrf(path.join(SERVER_OUT, "runtime"));
  // Next 15 tracing on Windows can omit required metadata modules.
  // Include the complete Next package so the standalone server can boot.
  cpRecursive(path.join(ROOT, "node_modules", "next"), path.join(SERVER_OUT, "node_modules", "next"));

  const staticSrc = path.join(ROOT, NEXT_DIST, "static");
  const staticDest = path.join(SERVER_OUT, NEXT_DIST, "static");
  if (fs.existsSync(staticSrc)) {
    cpRecursive(staticSrc, staticDest);
  }

  const publicSrc = path.join(ROOT, "public");
  if (fs.existsSync(publicSrc)) {
    cpRecursive(publicSrc, path.join(SERVER_OUT, "public"));
  }

  if (!fs.existsSync(path.join(SERVER_OUT, "node_modules"))) {
    throw new Error("standalone 缺少 node_modules，打包会无法启动");
  }

  console.log(`[pack] standalone 已就绪 → ${SERVER_OUT}`);
}

async function main() {
  fs.mkdirSync(DIST, { recursive: true });
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  await downloadNode(arch);
  rebuildNativeModules();
  prepareStandalone();
  verifyNativeRuntime();

  console.log(`[pack] ${process.platform} 打包资源准备完成`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
