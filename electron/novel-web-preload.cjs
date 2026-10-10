const { ipcRenderer } = require('electron');

// This preload belongs only to the local toolbar, never to the website view.
window.addEventListener('DOMContentLoaded', () => {
  for (const command of ['return', 'reload', 'continue', 'close']) {
    document.getElementById(command).addEventListener('click', () => ipcRenderer.send('rm-novel-web-command', command));
  }
  ipcRenderer.on('rm-novel-web-status', (_event, value) => {
    document.getElementById('status').textContent = value.message;
    document.getElementById('address').textContent = value.url;
    document.getElementById('continue').hidden = !value.reading;
    document.getElementById('close').textContent = value.reading ? '取消导入' : '完成并关闭';
  });
});
