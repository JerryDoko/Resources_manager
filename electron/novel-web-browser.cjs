const http = require('node:http');
const { randomBytes } = require('node:crypto');
const path = require('node:path');
const { BrowserWindow, WebContentsView, ipcMain, session, net } = require('electron');

// Browser rendering is deliberately restricted to these public sites. Site selectors
// remain in separately installed extensions, never in the application bundle.
const origins = new Set(['https://ixdzs8.com', 'https://www.ixdzs8.com', 'https://www.69shuba.com', 'https://69shuba.com', 'https://n.novelia.cc', 'https://www.esjzone.cc', 'https://esjzone.cc']);
const esjUIResources = new Map([
  ['https://cdnjs.cloudflare.com/ajax/libs/core-js/2.4.1/core.js', 'script'],
  ['https://cdnjs.cloudflare.com/ajax/libs/limonte-sweetalert2/6.10.1/sweetalert2.all.min.js', 'script'],
  ['https://cdnjs.cloudflare.com/ajax/libs/limonte-sweetalert2/6.10.1/sweetalert2.css', 'stylesheet'],
]);
function allowed(value, declared) {
  try { const url = new URL(value); return !url.username && !url.password && origins.has(url.origin) && declared.includes(url.origin); }
  catch { return false; }
}
function allowedCover(value, declared) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash && url.origin === 'https://images.novelpia.com' && declared?.includes(url.origin) && /^\/imagebox\/cover\/[a-zA-Z0-9_.-]+$/.test(url.pathname);
  } catch { return false; }
}
function allowedResource(value, declared, resourceType) {
  if (value === 'about:blank' || allowed(value, declared)) return true;
  try {
    const url = new URL(value);
    if (declared.some(origin => origin === 'https://www.esjzone.cc' || origin === 'https://esjzone.cc') && esjUIResources.get(url.href) === resourceType) return true;
    return resourceType !== 'mainFrame' && !url.username && !url.password && url.origin === 'https://challenges.cloudflare.com';
  } catch { return false; }
}
async function startNovelWebBrowser() {
  const token = randomBytes(32).toString('hex');
  const windows = new Set();
  const profiles = new Map();
  const controls = new Map();
  const commandHandler = (event, command) => controls.get(event.sender.id)?.(command);
  ipcMain.on('rm-novel-web-command', commandHandler);
  let active = false;
  const bridge = http.createServer(async (req, res) => {
    let replied = false;
    const reply = (status, value) => { replied = true; if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); } };
    if (req.method !== 'POST' || req.url !== '/chapter' || req.headers.authorization !== `Bearer ${token}` || req.headers.origin) return reply(403, { error: '不允许的浏览器读取请求' });
    if (active) return reply(429, { error: '正在读取另一个网页章节，请稍后重试' });
    let win, contents, update, ownsRequest = false, keepOpen = false, reading = true, metadataOnly = false;
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error('网页读取请求过大'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (input.mode === 'cover') {
        if (!/^[a-zA-Z0-9-]{1,80}$/.test(input.profileId) || !Array.isArray(input.origins) || !input.origins.some(origin => origin === 'https://www.esjzone.cc' || origin === 'https://esjzone.cc') || !Array.isArray(input.coverOrigins) || !allowedCover(input.url, input.coverOrigins)) throw new Error('封面读取范围无效');
        active = true; ownsRequest = true;
        let url = input.url;
        const signal = AbortSignal.timeout(12000);
        for (let redirect = 0; redirect <= 4; redirect++) {
          if (!allowedCover(url, input.coverOrigins)) throw new Error('封面跳转超出允许范围');
          // Use Chromium's normal proxy stack only for this fixed public cover CDN; never send login cookies.
          const response = await net.fetch(url, { redirect: 'manual', credentials: 'omit', signal });
          if ([301,302,303,307,308].includes(response.status)) {
            await response.body?.cancel();
            const location = response.headers.get('location');
            if (!location) throw new Error('封面跳转缺少地址');
            url = new URL(location, url).href; continue;
          }
          if (!response.ok || !response.body) throw new Error(`封面返回 ${response.status}`);
          const reader = response.body.getReader(), data = []; let size = 0;
          for (;;) {
            const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.length;
            if (size > 6 * 1024 * 1024) { await reader.cancel(); throw new Error('封面超过 6 MB'); }
            data.push(Buffer.from(chunk.value));
          }
          reply(200, { imageBase64: Buffer.concat(data).toString('base64') }); return;
        }
        throw new Error('封面重定向过多');
      }
      const json = input.format === 'json';
      const openOnly = input.mode === 'open';
      metadataOnly = input.mode === 'metadata';
      if (!Array.isArray(input.origins) || !allowed(input.url, input.origins) || !/^[a-zA-Z0-9-]{1,80}$/.test(input.profileId) || (input.mode !== undefined && !openOnly && !metadataOnly) || (metadataOnly && json) || (input.format !== undefined && !json) || (!openOnly && !json && (typeof input.content !== 'string' || input.content.length > 200)) || (input.comments !== undefined && (typeof input.comments !== 'string' || input.comments.length > 200))) throw new Error('浏览器读取范围无效');
      if (active) return reply(429, { error: '正在读取另一个网页章节，请稍后重试' });
      active = true;
      ownsRequest = true;
      const previous = profiles.get(input.profileId);
      if (previous && !previous.isDestroyed()) previous.destroy();
      const isolated = session.fromPartition(`persist:novel-web-${input.profileId}`);
      isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
      isolated.setPermissionCheckHandler(() => false);
      isolated.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !allowedResource(details.url, input.origins, details.resourceType) }));
      win = new BrowserWindow({ width: 1100, height: 800, minWidth: 640, minHeight: 420, show: false, title: '小说网页读取', webPreferences: { preload: path.join(__dirname, 'novel-web-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      windows.add(win);
      profiles.set(input.profileId, win);
      const view = new WebContentsView({ webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
      contents = view.webContents;
      win.contentView.addChildView(view);
      const resize = () => { const [width, height] = win.getContentSize(); view.setBounds({ x: 0, y: 116, width, height: Math.max(0, height - 116) }); };
      win.on('resize', resize); resize();
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      win.webContents.on('will-navigate', event => event.preventDefault());
      contents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const navigation = (event, url, _sameDocument, isMainFrame) => {
        const main = event.isMainFrame ?? isMainFrame ?? true;
        if (!allowedResource(event.url ?? url, input.origins, main ? 'mainFrame' : 'subFrame')) event.preventDefault();
      };
      contents.on('will-frame-navigate', navigation);
      contents.on('will-redirect', navigation);
      const preventDownload = (event) => event.preventDefault();
      isolated.on('will-download', preventDownload);
      const toolbarId = win.webContents.id;
      win.on('closed', () => {
        windows.delete(win); controls.delete(toolbarId);
        if (profiles.get(input.profileId) === win) profiles.delete(input.profileId);
        isolated.removeListener('will-download', preventDownload);
        if (!contents.isDestroyed()) contents.close();
      });
      res.on('close', () => { if (!replied && win && !win.isDestroyed()) win.destroy(); });
      await win.loadFile(path.join(__dirname, 'novel-web-toolbar.html'));
      let message = '正在读取章节正文…', forceCheck = false;
      update = text => {
        message = text;
        if (!win.isDestroyed()) win.webContents.send('rm-novel-web-status', { message, url: contents.getURL() || input.url, reading });
      };
      controls.set(toolbarId, command => {
        if (win.isDestroyed()) return;
        if (command === 'close') win.destroy();
        if (command === 'return') void contents.loadURL(input.url).catch(() => {});
        if (command === 'reload') contents.reload();
        if (command === 'continue' && reading) { forceCheck = true; update('正在检查当前网页正文…'); }
      });
      contents.on('did-navigate', () => update(message));
      contents.on('did-fail-load', (_event, code, description, _url, mainFrame) => {
        if (!metadataOnly && mainFrame && code !== -3 && !win.isDestroyed()) { update(`网页加载失败：${description}。可刷新后继续读取。`); win.show(); }
      });
      void contents.loadURL(input.url).catch(() => {});
      if (openOnly) {
        reading = false; keepOpen = true;
        update('可以自行登录或查看网页；完成后关闭此窗口，再回到小说导入。');
        win.show(); win.focus(); reply(200, { opened: true }); return;
      }
      {
        let deadline = Date.now() + (metadataOnly ? 8000 : 45000), shown = false, readyURL = '', readySince = 0, commentSignature = '', commentsChanged = 0;
        const started = Date.now();
        const show = text => {
          if (metadataOnly) throw new Error(text);
          update(text);
          if (!shown) { shown = true; deadline = Date.now() + 240000; win.show(); win.focus(); }
        };
        while (Date.now() < deadline) {
          if (win.isDestroyed()) throw new Error('网页读取窗口已关闭，导入已取消');
          if (!contents.isLoading() && contents.getURL() && contents.getURL() !== 'about:blank') {
            // Only chapter markup is returned; credentials and session cookies stay in the browser.
            const state = await contents.executeJavaScript(`(() => {
              const content = ${json ? "document.querySelector('pre')" : `document.querySelector(${JSON.stringify(input.content)})`};
              let comments = '';
              try { comments = ${input.comments && !json ? `Array.from(document.querySelectorAll(${JSON.stringify(input.comments)})).slice(0, 500).map(node => node.textContent.slice(0, 20000)).join('\\n')` : "''"}; } catch {}
              const title = document.title;
              const login = /會員登入|会员登录|登入\\s*\\/\\s*註冊|登录\\s*\\/\\s*注册/.test(title) || !!document.querySelector('form.login-box');
              const challenge = /正在验证浏览器|正在进行安全验证|Just a moment|请稍候|Checking your browser/i.test(title) || !!document.querySelector('#challenge-running, #challenge-stage') || (!content && !!document.querySelector('iframe[src*="challenges.cloudflare.com"]'));
              return { login, challenge, comments, ready: !login && !challenge && !!content && content.textContent.trim().length >= 30, url: location.href, html: !login && !challenge && content ? ${json ? "content.textContent" : metadataOnly ? "(() => { const copy = document.documentElement.cloneNode(true); copy.querySelectorAll('form,input,textarea,script').forEach(node => node.remove()); return copy.outerHTML; })()" : "document.documentElement.outerHTML"} : null };
            })()`);
            if (state.ready) {
              if (readyURL !== state.url) { readyURL = state.url; readySince = Date.now(); commentsChanged = readySince; commentSignature = state.comments; }
              if (commentSignature !== state.comments) { commentSignature = state.comments; commentsChanged = Date.now(); }
              // Give asynchronously loaded comments a bounded settling period; empty comment sections remain valid.
              if (input.comments && Date.now() - readySince < 3000 && (!state.comments || Date.now() - commentsChanged < 600)) {
                await new Promise(resolve => setTimeout(resolve, 300)); continue;
              }
              if (!allowed(state.url, input.origins) || Buffer.byteLength(state.html) > 4 * 1024 * 1024) throw new Error('网页地址或大小不符合要求');
              const canonical = new URL(state.url);
              for (const key of [...canonical.searchParams.keys()]) if (key === 'challenge' || key.startsWith('__cf_chl_')) canonical.searchParams.delete(key);
              canonical.hash = '';
              reply(200, { html: state.html, url: canonical.href }); return;
            }
            readyURL = '';
            if (state.login) show('此章节需要会员登录。请在下方自行登录，随后点击「返回原章节」；找到正文后会自动继续导入。');
            else if (state.challenge) show('请在下方自行完成网站安全验证；找到正文后会自动继续导入。');
            else if (Date.now() - started > 2000 || forceCheck) show('尚未匹配到章节正文。可操作下方网页，或返回原章节后继续读取；若正文已显示仍无法导入，需要校验扩展规则。');
            forceCheck = false;
          }
          if (Date.now() - started > 10000 && !shown) show('网页仍在加载，可在下方查看或刷新；关闭此窗口可取消导入。');
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        throw new Error('等待网页操作超时，网页窗口已保留。登录完成后关闭窗口，再回到小说导入重试。');
      }
    } catch (error) {
      if (win?.isDestroyed()) error = new Error('网页读取窗口已关闭，导入已取消');
      if (!metadataOnly && win && !win.isDestroyed() && update) {
        keepOpen = true; reading = false;
        update(error.message || '读取失败，请关闭窗口后重试。'); win.show();
      }
      reply(400, { error: error.message || '浏览器读取失败' });
    }
    finally { if (win && !keepOpen && !win.isDestroyed()) win.destroy(); if (ownsRequest) active = false; }
  });
  bridge.headersTimeout = 10000;
  bridge.requestTimeout = 310000;
  await new Promise((resolve, reject) => { bridge.once('error', reject); bridge.listen(0, '127.0.0.1', resolve); });
  process.env.RM_NOVEL_BROWSER_URL = `http://127.0.0.1:${bridge.address().port}/chapter`;
  process.env.RM_NOVEL_BROWSER_TOKEN = token;
  return () => { ipcMain.removeListener('rm-novel-web-command', commandHandler); for (const win of windows) if (!win.isDestroyed()) win.destroy(); bridge.close(); };
}
module.exports = { startNovelWebBrowser, allowed, allowedResource, allowedCover };
