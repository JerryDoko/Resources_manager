/**
 * Resources Manager — 内置浏览器启动器
 * 1. 启动 Next 服务
 * 2. 优先 Electron；否则用 Chrome/Edge --app 独立窗口
 * 3. 关掉全部内置窗口后停止 Next 并退出
 */
const { spawn, execFileSync } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const MODE = process.env.LM_MODE || process.argv[2] || "dev";
const URL = `http://127.0.0.1:${PORT}`;
const PROFILE = path.join(ROOT, ".lm-browser-profile");

/** @type {import('child_process').ChildProcess | null} */
let server = null;
/** @type {import('child_process').ChildProcess | null} */
let browser = null;
let shuttingDown = false;

function log(...args) {
  console.log("[lm]", ...args);
}

function waitForServer(url, tries = 90) {
  return new Promise((resolve, reject) => {
    let left = tries;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (--left <= 0) reject(new Error(`服务未就绪: ${url}`));
        else setTimeout(tick, 400);
      });
      req.setTimeout(800, () => {
        req.destroy();
        if (--left <= 0) reject(new Error(`服务未就绪: ${url}`));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

function freePort(port) {
  try {
    if (process.platform === "win32") return;
    const out = execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
      encoding: "utf8",
    }).trim();
    if (!out) return;
    for (const pid of out.split("\n")) {
      try {
        process.kill(Number(pid), "SIGTERM");
      } catch {
        /* ignore */
      }
    }
    // hard kill leftovers
    setTimeout(() => {
      try {
        const still = execFileSync("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], {
          encoding: "utf8",
        }).trim();
        for (const pid of still.split("\n").filter(Boolean)) {
          try {
            process.kill(Number(pid), "SIGKILL");
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* nothing */
      }
    }, 500);
  } catch {
    /* nothing listening */
  }
}

function startServer() {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const args =
    MODE === "start"
      ? ["run", "start", "--", "-p", String(PORT)]
      : ["run", "dev", "--", "-p", String(PORT)];

  server = spawn(npmCmd, args, {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), BROWSER: "none" },
    stdio: "inherit",
    shell: process.platform === "win32",
    detached: process.platform !== "win32",
  });

  server.on("exit", (code) => {
    server = null;
    if (!shuttingDown) {
      log(`Next 退出 (code=${code})`);
      shutdown(code || 0);
    }
  });
}

function findBrowser() {
  if (process.env.LM_BROWSER && fs.existsSync(process.env.LM_BROWSER)) {
    return process.env.LM_BROWSER;
  }
  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  if (process.platform === "linux") {
    for (const n of [
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "microsoft-edge",
    ]) {
      try {
        const p = execFileSync("which", [n], { encoding: "utf8" }).trim();
        if (p) return p;
      } catch {
        /* continue */
      }
    }
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const pf = process.env["PROGRAMFILES"] || "C:\\Program Files";
    const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    for (const c of [
      path.join(pf, "Google/Chrome/Application/chrome.exe"),
      path.join(pf86, "Google/Chrome/Application/chrome.exe"),
      path.join(local, "Google/Chrome/Application/chrome.exe"),
      path.join(pf, "Microsoft/Edge/Application/msedge.exe"),
    ]) {
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

function electronAvailable() {
  const marker = path.join(ROOT, "node_modules", "electron", "path.txt");
  const macApp = path.join(
    ROOT,
    "node_modules",
    "electron",
    "dist",
    "Electron.app"
  );
  const linuxBin = path.join(ROOT, "node_modules", "electron", "dist", "electron");
  return (
    fs.existsSync(marker) || fs.existsSync(macApp) || fs.existsSync(linuxBin)
  );
}

function openBuiltinBrowser(browserPath) {
  fs.mkdirSync(PROFILE, { recursive: true });
  const args = [
    `--app=${URL}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,840",
  ];

  browser = spawn(browserPath, args, {
    stdio: "ignore",
    detached: false,
  });

  log(`内置窗口已打开 (${path.basename(browserPath)})`);
  log("关闭全部内置窗口后将自动停止服务");

  browser.on("exit", () => {
    browser = null;
    log("内置浏览器已关闭，停止服务…");
    shutdown(0);
  });
}

function stopServer() {
  if (server && server.pid) {
    const pid = server.pid;
    server = null;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(pid), "/f", "/t"]);
      } else {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          try {
            process.kill(pid, "SIGTERM");
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  freePort(PORT);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopServer();
  if (browser && !browser.killed) {
    try {
      browser.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 500);
}

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Resources Manager");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (electronAvailable()) {
    const electronBin = path.join(ROOT, "node_modules", ".bin", "electron");
    log("使用 Electron 内置浏览器…");
    const child = spawn(electronBin, [path.join(ROOT, "electron", "main.js")], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT), LM_MODE: MODE },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => process.exit(code || 0));
    return;
  }

  const browserPath = findBrowser();
  if (!browserPath) {
    console.error(
      "[lm] 未找到 Chrome / Edge / Chromium。\n" +
        "请安装 Google Chrome，或设置 LM_BROWSER=/path/to/chrome\n" +
        "也可: npm i -D electron 后使用完整内置壳"
    );
    process.exit(1);
  }

  freePort(PORT);
  log(`启动服务 (${MODE}) → ${URL}`);
  startServer();

  try {
    await waitForServer(URL);
  } catch (e) {
    console.error(e.message || e);
    shutdown(1);
    return;
  }

  openBuiltinBrowser(browserPath);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

main().catch((e) => {
  console.error(e);
  shutdown(1);
});
