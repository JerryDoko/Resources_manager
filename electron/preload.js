const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rmDesktop", {
  isElectron: true,
  platform: process.platform,
  close: () => ipcRenderer.send("rm:window-close"),
  minimize: () => ipcRenderer.send("rm:window-minimize"),
  toggleFullscreen: () => ipcRenderer.send("rm:window-toggle-fullscreen"),
  isFullScreen: () => ipcRenderer.invoke("rm:is-fullscreen"),
  onFullscreenChange: (callback) => {
    const listener = (_event, value) => callback(!!value);
    ipcRenderer.on("rm:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("rm:fullscreen-changed", listener);
  },
});
