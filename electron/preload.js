const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rmDesktop", {
  isElectron: true,
  platform: process.platform,
  close: () => ipcRenderer.send("rm:window-close"),
  minimize: () => ipcRenderer.send("rm:window-minimize"),
  toggleMaximize: () => ipcRenderer.send("rm:window-toggle-maximize"),
  isMaximized: () => ipcRenderer.invoke("rm:is-maximized"),
  toggleFullscreen: () => ipcRenderer.send("rm:window-toggle-fullscreen"),
  isFullScreen: () => ipcRenderer.invoke("rm:is-fullscreen"),
  chooseFolder: (prompt) => ipcRenderer.invoke("rm:choose-folder", prompt),
  chooseNovel: () => ipcRenderer.invoke("rm:choose-novel"),
  revealItem: (targetPath) => ipcRenderer.invoke("rm:reveal-item", targetPath),
  onFullscreenChange: (callback) => {
    const listener = (_event, value) => callback(!!value);
    ipcRenderer.on("rm:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("rm:fullscreen-changed", listener);
  },
  onMaximizedChange: (callback) => {
    const listener = (_event, value) => callback(!!value);
    ipcRenderer.on("rm:maximized-changed", listener);
    return () => ipcRenderer.removeListener("rm:maximized-changed", listener);
  },
});
