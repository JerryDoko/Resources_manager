/**
 * Resources Manager — Electron 壳
 * 开发：启动 npm next；打包：启动内置 Node + standalone server
 */
const { app, BrowserWindow, shell, Menu } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const net = require("net");

const isPackaged = app.isPackaged;
const ROOT = isPackaged
  ? path.join(process.resourcesPath, "server")
  : path.join(__dirname, "..");

const DEFAULT_PORT = Number(process.env.PORT || 18765);
let PORT = DEFAULT_PORT;
let URL = `http://127.0.0.1:${PORT}`;

/** @type {import('child_process').ChildProcess | null} */
let server = null;
let quitting = false;

function waitForServer(url, tries = 100) {
  return new Promise((promiseResolve, promiseReject) => {
    let left = tries;
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        promiseResolve();
      });
      req.on("error", () => {
        left -= 1;
        if (left <= 0) promiseReject(new Error(`服务未在 ${url} 就绪`));
        else setTimeout(tick, 400);
      });
      req.setTimeout(800, () => {
        req.destroy();
        left -= 1;
        if (left <= 0) promiseReject(new Error(`服务未在 ${url} 就绪`));
        else setTimeout(tick, 400);
      });
    };
    tick();
  });
}

function findFreePort(preferred) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => {
      const fallback = net.createServer();
      fallback.listen(0, "127.0.0.1", () => {
        const addr = fallback.address();
        const port = typeof addr === "object" && addr ? addr.port : preferred;
        fallback.close(() => resolve(port));
      });
    });
    tester.listen(preferred, "127.0.0.1", () => {
      tester.close(() => resolve(preferred));
    });
  });
}

function dataDir() {
  return path.join(app.getPath("userData"), "data");
}

function startPackagedServer() {
  const serverJs = path.join(ROOT, "server.js");
  const nodeBin = path.join(process.resourcesPath, "node", "bin", "node");
  if (!fs.existsSync(serverJs)) {
    throw new Error(`找不到打包服务: ${serverJs}`);
  }
  if (!fs.existsSync(nodeBin)) {
    throw new Error(`找不到内置 Node: ${nodeBin}`);
  }

  const env = {
    ...process.env,
    PORT: String(PORT),
    HOSTNAME: "127.0.0.1",
    BROWSER: "none",
    RESOURCES_MANAGER_DATA: dataDir(),
    RESOURCES_MANAGER_APPLY_DEFAULT: "1",
    NODE_ENV: "production",
  };

  server = spawn(nodeBin, [serverJs], {
    cwd: ROOT,
    env,
    stdio: "inherit",
  });

  server.on("exit", (code) => {
    server = null;
    if (!quitting) {
      console.log(`[rm] 服务退出 (code=${code})，关闭应用`);
      app.quit();
    }
  });
}

function startDevServer() {
  const MODE = process.env.LM_MODE || "dev";
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const args =
    MODE === "start"
      ? ["run", "start", "--", "-p", String(PORT), "-H", "127.0.0.1"]
      : ["run", "dev", "--", "-p", String(PORT), "-H", "127.0.0.1"];

  server = spawn(npmCmd, args, {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      BROWSER: "none",
      RESOURCES_MANAGER_DATA: dataDir(),
      RESOURCES_MANAGER_APPLY_DEFAULT: "1",
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  server.on("exit", (code) => {
    server = null;
    if (!quitting) {
      console.log(`[rm] Next 进程退出 (code=${code})，关闭应用`);
      app.quit();
    }
  });
}

function startServer() {
  if (isPackaged) startPackagedServer();
  else startDevServer();
}

function stopServer() {
  if (!server || server.killed) return;
  const child = server;
  server = null;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
    } else {
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
    console.warn("[rm] 停止服务失败", e);
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (
        u.origin === `http://127.0.0.1:${PORT}` ||
        u.origin === `http://localhost:${PORT}`
      ) {
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

  try {
    fs.mkdirSync(dataDir(), { recursive: true });
  } catch {
    /* ignore */
  }

  PORT = await findFreePort(DEFAULT_PORT);
  URL = `http://127.0.0.1:${PORT}`;

  console.log(`[rm] 启动服务 → ${URL} (packaged=${isPackaged})`);
  try {
    startServer();
  } catch (e) {
    console.error(e);
    app.quit();
    return;
  }

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

app.on("window-all-closed", () => {
  quitting = true;
  console.log("[rm] 所有窗口已关闭，停止服务…");
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
