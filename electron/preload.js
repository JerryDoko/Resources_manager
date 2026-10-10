const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rmDesktop", {
  isElectron: true,
  platform: process.platform,
  close: () => ipcRenderer.send("rm:window-close"),
  minimize: () => ipcRenderer.send("rm:window-minimize"),
  toggleFullscreen: () => ipcRenderer.send("rm:window-toggle-fullscreen"),
  isFullScreen: () => ipcRenderer.invoke("rm:is-fullscreen"),
  chooseFolder: (prompt) => ipcRenderer.invoke("rm:choose-folder", prompt),
  chooseNovel: () => ipcRenderer.invoke("rm:choose-novel"),
  revealItem: (targetPath) => ipcRenderer.invoke("rm:reveal-item", targetPath),
  onNovelAudioDownload: (callback) => {
    const listener = (_event, download) => callback(download);
    ipcRenderer.on("rm:novel-audio-download", listener);
    return () => ipcRenderer.removeListener("rm:novel-audio-download", listener);
  },
  onFullscreenChange: (callback) => {
    const listener = (_event, value) => callback(!!value);
    ipcRenderer.on("rm:fullscreen-changed", listener);
    return () => ipcRenderer.removeListener("rm:fullscreen-changed", listener);
  },
});
