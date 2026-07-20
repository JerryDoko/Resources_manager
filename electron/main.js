/**
 * Resources Manager — 内置浏览器壳
 * 启动 Next 服务 → 打开窗口；关掉全部窗口后停止服务并退出
 */
const { app, BrowserWindow, shell, Menu } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const MODE = process.env.LM_MODE || "dev"; // dev | start
const URL = `http://127.0.0.1:${PORT}`;

/** @type {import('child_process').ChildProcess | null} */
let server = null;
let quitting = false;

function waitForServer(url, tries = 80) {
  return new Promise((resolve, reject) => {
    let left = tries;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        left -= 1;
        if (left <= 0) reject(new Error(`服务未在 ${url} 就绪`));
        else setTimeout(tick, 400);
      });
      req.setTimeout(800, () => {
        req.destroy();
        left -= 1;
        if (left <= 0) reject(new Error(`服务未在 ${url} 就绪`));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
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
  });

  server.on("exit", (code) => {
    server = null;
    if (!quitting) {
      console.log(`[lm] Next 进程退出 (code=${code})，关闭应用`);
      app.quit();
    }
  });
}

function stopServer() {
  if (!server || server.killed) return;
  const child = server;
  server = null;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
    } else {
      // 杀掉整个进程组，避免 next 子进程残留
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }
      }, 1500);
    }
  } catch (e) {
    console.warn("[lm] 停止服务失败", e);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "Resources Manager",
    backgroundColor: "#eef1f0",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false,
  });

  win.once("ready-to-show", () => win.show());
  win.loadURL(URL);

  // 外链用系统浏览器；同源新窗口仍用内置窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.origin === `http://127.0.0.1:${PORT}` || u.origin === `http://localhost:${PORT}`) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 1100,
            height: 760,
            backgroundColor: "#eef1f0",
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
      }
    } catch {
      /* fallthrough */
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "文件",
      submenu: [
        {
          label: "新建窗口",
          accelerator: "CmdOrCtrl+N",
          click: () => createWindow(),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "编辑",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "窗口",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "front" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  app.setName("Resources Manager");
  buildMenu();
  console.log(`[lm] 启动 Next (${MODE}) → ${URL}`);
  startServer();
  try {
    await waitForServer(URL);
  } catch (e) {
    console.error(e);
    stopServer();
    app.quit();
    return;
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 关掉所有内置窗口 → 停止脚本并退出
app.on("window-all-closed", () => {
  quitting = true;
  console.log("[lm] 所有窗口已关闭，停止服务…");
  stopServer();
  app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  stopServer();
});

process.on("SIGINT", () => {
  quitting = true;
  stopServer();
  app.quit();
});
process.on("SIGTERM", () => {
  quitting = true;
  stopServer();
  app.quit();
});
