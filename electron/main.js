/**
 * Resources Manager — Electron 壳
 * 开发：启动 npm next；打包：启动内置 Node + standalone server
 */
const { app, BrowserWindow, shell, Menu, ipcMain, dialog, session } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { mergeLegacyProfileData } = require("./profile-migration.cjs");
const { startNovelWebBrowser } = require("./novel-web-browser.cjs");
let stopNovelWebBrowser;

const isPackaged = app.isPackaged;
const appDataRoot = app.getPath("appData");
const stableUserDataDir =
  process.env.RESOURCES_MANAGER_USER_DATA ||
  path.join(appDataRoot, "resources-manager");
app.setPath("userData", stableUserDataDir);

const ROOT = isPackaged
  ? path.join(process.resourcesPath, "server")
  : path.join(__dirname, "..");

const DEFAULT_PORT = Number(process.env.PORT || 18765);
let PORT = DEFAULT_PORT;
let URL = `http://127.0.0.1:${PORT}`;

/** @type {import('child_process').ChildProcess | null} */
let server = null;
let quitting = false;

function pluginConnectionPath() {
  return path.join(app.getPath("userData"), "ai-plugin-connection.json");
}

function publishPluginConnection() {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(
      pluginConnectionPath(),
      JSON.stringify({ url: URL, pid: process.pid, updatedAt: new Date().toISOString() }),
      { encoding: "utf8", mode: 0o600 }
    );
  } catch (error) {
    console.warn("[rm] 无法发布 AI 插件连接信息", error);
  }
}

function clearPluginConnection() {
  try {
    const file = pluginConnectionPath();
    if (!fs.existsSync(file)) return;
    const connection = JSON.parse(fs.readFileSync(file, "utf8"));
    if (connection.pid === process.pid) fs.unlinkSync(file);
  } catch {
    /* stale connection files are ignored by the plugin */
  }
}

function waitForServer(url, tries = 100) {
  return new Promise((promiseResolve, promiseReject) => {
    let left = tries;
    const tick = () => {
      let attemptFinished = false;
      const retry = () => {
        if (attemptFinished) return;
        attemptFinished = true;
        left -= 1;
        if (left <= 0) promiseReject(new Error(`服务未在 ${url} 就绪`));
        else setTimeout(tick, 400);
      };
      const req = http.get(url, (res) => {
        if (attemptFinished) {
          res.resume();
          return;
        }
        attemptFinished = true;
        res.resume();
        promiseResolve();
      });
      req.on("error", retry);
      req.setTimeout(800, () => {
        if (attemptFinished) return;
        attemptFinished = true;
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

function applyDefaultProfileAtLaunch() {
  const file = path.join(dataDir(), "profiles.json");
  try {
    if (!fs.existsSync(file)) return;
    const registry = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      registry.defaultId &&
      registry.activeId !== registry.defaultId &&
      registry.profiles?.some((profile) => profile.id === registry.defaultId)
    ) {
      registry.activeId = registry.defaultId;
      fs.writeFileSync(file, JSON.stringify(registry, null, 2), "utf8");
    }
  } catch (error) {
    console.warn("[rm] 应用默认配置失败", error);
  }
}

function startPackagedServer() {
  const serverJs = path.join(ROOT, "server.js");
  const nodeBin =
    process.platform === "win32"
      ? path.join(process.resourcesPath, "node", "node.exe")
      : path.join(process.resourcesPath, "node", "bin", "node");
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
    RM_KOKORO_ROOT: path.join(process.resourcesPath, "kokoro"),
    RM_KOKORO_INSTALL_ROOT: path.join(app.getPath("userData"), "kokoro"),
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
  let command = process.platform === "win32" ? "npm.cmd" : "npm";
  let args = ["run", "dev", "--", "-p", String(PORT), "-H", "127.0.0.1"];
  let cwd = ROOT;

  if (MODE === "start") {
    const buildDir = process.env.RM_NEXT_DIST_DIR || ".next";
    const standaloneRoot = path.join(ROOT, buildDir, "standalone");
    const standaloneServer = path.join(standaloneRoot, "server.js");
    if (!fs.existsSync(standaloneServer)) {
      throw new Error("找不到 standalone 构建，请先运行 npm run build");
    }
    const staticSource = path.join(ROOT, buildDir, "static");
    const staticDestination = path.join(standaloneRoot, buildDir, "static");
    if (fs.existsSync(staticSource)) {
      fs.cpSync(staticSource, staticDestination, { recursive: true, force: true });
    }
    const publicSource = path.join(ROOT, "public");
    const publicDestination = path.join(standaloneRoot, "public");
    if (fs.existsSync(publicSource)) {
      fs.cpSync(publicSource, publicDestination, { recursive: true, force: true });
    }
    command = process.env.RESOURCES_MANAGER_NODE || "node";
    args = [standaloneServer];
    cwd = standaloneRoot;
  }

  server = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      PORT: String(PORT),
      BROWSER: "none",
      RESOURCES_MANAGER_DATA: dataDir(),
      RM_KOKORO_ROOT: path.join(ROOT, "runtime", "kokoro"),
      RM_KOKORO_INSTALL_ROOT: path.join(app.getPath("userData"), "kokoro"),
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
  clearPluginConnection();
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

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  const isMac = process.platform === "darwin";
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: "Resources Manager",
    backgroundColor: "#00000000",
    transparent: true,
    vibrancy: "under-window",
    visualEffectState: "active",
    ...(isMac
      ? {
          frame: true,
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 14, y: 16 },
        }
      : { frame: false }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  mainWindow = win;

  const notifyFullscreen = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send("rm:fullscreen-changed", mainWindow.isFullScreen());
  };
  win.on("enter-full-screen", notifyFullscreen);
  win.on("leave-full-screen", notifyFullscreen);

  win.once("ready-to-show", () => {
    win.show();
    notifyFullscreen();
  });
  win.loadURL(URL);

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new globalThis.URL(url);
      if (
        u.origin === `http://127.0.0.1:${PORT}` ||
        u.origin === `http://localhost:${PORT}`
      ) {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: u.pathname === "/novel-floating" ? 460 : 1100,
            height: u.pathname === "/novel-floating" ? 240 : 760,
            backgroundColor: "#00000000",
            ...(u.pathname === "/novel-floating" ? { alwaysOnTop: true, frame: false, minWidth: 380, minHeight: 200, resizable: true, title: "听书播放器", backgroundColor: "#fafbf9" } : {}),
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
  win.webContents.on("did-create-window", (child) => {
    const closeChild = () => { if (!child.isDestroyed()) child.close(); };
    win.once("closed", closeChild);
    child.once("closed", () => win.removeListener("closed", closeChild));
  });

  return win;
}

ipcMain.handle("rm:is-fullscreen", () => mainWindow?.isFullScreen() ?? false);
ipcMain.handle("rm:choose-folder", async (_event, prompt) => {
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title: typeof prompt === "string" ? prompt : "选择媒体文件夹",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled ? null : result.filePaths[0] || null;
});
ipcMain.handle("rm:choose-novel", async () => {
  const result=await dialog.showOpenDialog(mainWindow || undefined,{title:"选择本地小说",properties:["openFile"],filters:[{name:"小说",extensions:["txt","epub"]}]});
  return result.canceled?null:result.filePaths[0]||null;
});
ipcMain.handle("rm:reveal-item", (_event, targetPath) => {
  if (typeof targetPath !== "string" || !path.isAbsolute(targetPath)) return false;
  if (!fs.existsSync(targetPath)) return false;
  shell.showItemInFolder(targetPath);
  return true;
});

ipcMain.on("rm:window-close", () => mainWindow?.close());
ipcMain.on("rm:window-minimize", () => mainWindow?.minimize());
ipcMain.on("rm:window-toggle-fullscreen", () => {
  if (!mainWindow) return;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

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
  session.defaultSession.on("will-download", (_event, item, contents) => {
    let download;
    try {
      download = new globalThis.URL(item.getURL());
      if (download.origin !== URL || download.pathname !== "/api/novel" || download.searchParams.get("action") !== "audio-export-download") return;
    } catch { return; }
    const id = download.searchParams.get("id"), filename = item.getFilename();
    const notify = (state) => { if (contents && !contents.isDestroyed()) contents.send("rm:novel-audio-download", { id, state, filename, ...(state === "completed" ? { path: item.getSavePath() } : {}) }); };
    // Do not report an API error document as a successfully saved audio archive.
    if (!["audio/wav", "application/zip"].includes(item.getMimeType())) { item.cancel(); notify("interrupted"); return; }
    item.setSaveDialogOptions({ title: "保存小说语音", defaultPath: path.join(app.getPath("downloads"), path.basename(filename)), buttonLabel: "保存", filters: [{ name: "小说语音", extensions: [filename.endsWith(".zip") ? "zip" : "wav"] }] });
    notify("started");
    let finished = false;
    const finish = (state) => { if (finished) return; finished = true; notify(state); };
    item.once("done", (_event, state) => finish(state));
    item.on("updated", (_event, state) => { if (state === "interrupted") { finish("interrupted"); item.cancel(); } });
  });

  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    if (!process.env.RESOURCES_MANAGER_USER_DATA) mergeLegacyProfileData(dataDir(), [
      path.join(appDataRoot, "Electron", "data"),
      path.join(appDataRoot, "Resources Manager", "data"),
    ]);
    applyDefaultProfileAtLaunch();
  } catch {
    /* ignore */
  }

  PORT = await findFreePort(DEFAULT_PORT);
  URL = `http://127.0.0.1:${PORT}`;

  console.log(`[rm] 启动服务 → ${URL} (packaged=${isPackaged})`);
  try {
    stopNovelWebBrowser = await startNovelWebBrowser();
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
  publishPluginConnection();
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
  stopNovelWebBrowser?.();
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
