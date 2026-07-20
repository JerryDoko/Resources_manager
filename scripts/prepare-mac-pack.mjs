#!/usr/bin/env node
/**
 * 准备 macOS 打包资源：
 * 1. next build (standalone)
 * 2. 拷贝 static / public 进 standalone
 * 3. 下载与当前 Node 同版本的官方 darwin 二进制
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

const CONNECT_TIMEOUT_MS = 10_000;

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
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
  const version = process.version.replace(/^v/, "");
  const platform = "darwin";
  const name = `node-v${version}-${platform}-${arch}`;
  const url = `https://nodejs.org/dist/v${version}/${name}.tar.gz`;
  const destDir = path.join(DIST, "node-download");
  const tarball = path.join(DIST, `${name}.tar.gz`);

  rmrf(destDir);
  fs.mkdirSync(destDir, { recursive: true });

  console.log(`[pack] 下载 Node ${version} (${arch}) …`);
  console.log(`[pack] ${url}`);
  await downloadToFile(url, tarball);

  execFileSync("tar", ["-xzf", tarball, "-C", destDir], { stdio: "inherit" });
  fs.unlinkSync(tarball);

  const extracted = path.join(destDir, name);
  const nodeBin = path.join(extracted, "bin", "node");
  if (!fs.existsSync(nodeBin)) {
    throw new Error(`Node 解压后缺少 bin/node: ${extracted}`);
  }

  rmrf(NODE_OUT);
  fs.mkdirSync(path.join(NODE_OUT, "bin"), { recursive: true });
  fs.copyFileSync(nodeBin, path.join(NODE_OUT, "bin", "node"));
  fs.chmodSync(path.join(NODE_OUT, "bin", "node"), 0o755);
  rmrf(destDir);
  console.log(`[pack] Node 已就绪 → ${NODE_OUT}`);
}

function prepareStandalone() {
  console.log("[pack] next build …");
  execSync("npx next build", { cwd: ROOT, stdio: "inherit", env: process.env });

  const standalone = path.join(ROOT, ".next", "standalone");
  if (!fs.existsSync(standalone)) {
    throw new Error("未找到 .next/standalone，请确认 next.config output: standalone");
  }

  rmrf(SERVER_OUT);
  cpRecursive(standalone, SERVER_OUT);

  // 构建时可能落在 cwd 下的本地库数据，不要打进安装包
  rmrf(path.join(SERVER_OUT, "data"));

  const staticSrc = path.join(ROOT, ".next", "static");
  const staticDest = path.join(SERVER_OUT, ".next", "static");
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
  prepareStandalone();

  const arch = process.arch === "arm64" ? "arm64" : "x64";
  await downloadNode(arch);

  console.log("[pack] 准备完成。可运行: npm run dist:mac");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
