import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import os from 'node:os';
const require = createRequire(import.meta.url);
const { _electron, expect } = require(process.env.RM_PLAYWRIGHT || '/Users/hsx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/test');
const root = process.cwd(), userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-extension-ui-'));
const app = await _electron.launch({ executablePath: process.env.RM_TEST_APP || path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), args: process.env.RM_TEST_APP ? [] : ['electron/main.js'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', LM_MODE: 'start', PORT: '31877', HOSTNAME: '127.0.0.1', RESOURCES_MANAGER_USER_DATA: userData }, timeout: 60000 });
const errors = [], output = path.join(root, 'test-results/novel'); fs.mkdirSync(output, { recursive: true });
const logs = [];
app.process().stdout?.on('data', data => logs.push(data.toString()));
app.process().stderr?.on('data', data => logs.push(data.toString()));
app.on('window', page => page.on('pageerror', error => errors.push(error.message)));
try {
  const page = await app.firstWindow({ timeout: 60000 }); page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/update/check*', route => route.fulfill({ contentType: 'application/json', body: '{"updateAvailable":false}' }));
  await page.waitForLoadState('domcontentloaded');
  await page.getByRole('button', { name: /^小说\s+\d/ }).click();
  await page.getByRole('button', { name: '导入', exact: true }).click();
  await page.getByText('网页扩展 · 未安装', { exact: true }).click();
  await expect(page.getByRole('button', { name: '安装原创示例扩展', exact: true })).toBeEnabled();
  page.once('dialog', d => d.dismiss());
  await page.getByRole('button', { name: '安装原创示例扩展', exact: true }).click();
  await expect(page.getByRole('button', { name: '导入网页', exact: true })).toHaveCount(0);
  assert.equal(await page.evaluate(() => fetch('/api/novel?action=context').then(r => r.json()).then(d => d.webExtension)), null);
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '安装原创示例扩展', exact: true }).click();
  await expect(page.getByLabel('授权章节链接', { exact: true })).toHaveValue(/chapter-1\.html$/);
  let realWeb = false;
  if (process.env.RM_TEST_EXTENSION_WEB === '1') {
    const response = page.waitForResponse(r => r.url().endsWith('/api/novel') && r.request().postData()?.includes('"action":"web"'), { timeout: 65000 });
    await page.getByRole('button', { name: '导入网页', exact: true }).click();
    const imported = await response; assert.equal(imported.status(), 200); const { itemId } = await imported.json();
    const book = await page.evaluate(async itemId => {
      const { profileId } = await fetch('/api/novel?action=context').then(r => r.json());
      const request = async (action, extra = {}) => {
        const r = await fetch('/api/novel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId, itemId, action, ...extra }) });
        const value = await r.json(); if (!r.ok) throw new Error(value.error); return value;
      };
      const first = await request('book'), session = await request('begin');
      const next = await request('next', { sessionId: session.id, chapterId: first.chapters[0].id });
      const all = await request('book'); await request('cancel', { sessionId: session.id });
      return { title: all.title, chapters: all.chapters.length, next: next.title };
    }, itemId);
    assert.deepEqual(book, { title: '灯塔来信', chapters: 2, next: '第二章 灯亮的时候' }); realWeb = true;
  }
  const zipResponse = await page.request.get(new URL('/api/novel/extensions?format=zip', page.url()).href);
  assert.equal(zipResponse.status(), 200); assert.match(zipResponse.headers()['content-disposition'], /\.zip/);
  const zipFile = path.join(userData, 'demo.zip'); fs.writeFileSync(zipFile, await zipResponse.body());
  await page.getByRole('button', { name: '移除扩展', exact: true }).click();
  page.once('dialog', d => d.accept()); await page.getByLabel('网页扩展 JSON', { exact: true }).setInputFiles(zipFile);
  await expect(page.getByRole('button', { name: '导入网页', exact: true })).toBeVisible();
  await page.getByText('创建站点扩展', { exact: true }).click();
  await page.getByLabel('扩展名称', { exact: true }).fill('原创站点自定义测试');
  await page.getByLabel('允许的 HTTPS 来源', { exact: true }).fill('https://example.org');
  await expect(page.getByLabel('来源状态', { exact: true })).toHaveValue('unverified');
  await page.getByLabel('来源说明 HTTPS 链接', { exact: true }).fill('https://example.org/rights');
  await page.getByLabel('来源说明', { exact: true }).fill('此测试使用自己的原创短篇并同意复制保存与朗读，不包含第三方作品。');
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '校验并安装', exact: true }).click();
  await expect(page.getByText('网页扩展 · 原创站点自定义测试', { exact: true })).toBeVisible();
  const bad = path.join(userData, 'bad.json'); fs.writeFileSync(bad, '{"script":"malicious()"}');
  await page.getByLabel('网页扩展 JSON', { exact: true }).setInputFiles(bad);
  await expect(page.getByRole('status')).toContainText('扩展声明无效');
  assert.equal(await page.evaluate(() => fetch('/api/novel?action=context').then(r => r.json()).then(d => d.webExtension.name)), '原创站点自定义测试');
  if (process.env.RM_TEST_EXTERNAL_EXTENSION) {
    page.once('dialog', d => { assert.match(d.message(), /来源授权未核实/); return d.accept(); });
    await page.getByLabel('网页扩展 JSON', { exact: true }).setInputFiles(process.env.RM_TEST_EXTERNAL_EXTENSION);
    await expect(page.getByText('网页扩展 · 无错书吧 · 网页适配', { exact: true })).toBeVisible();
    await expect(page.getByText('来源授权未核实', { exact: true })).toBeVisible();
    const installed = await page.evaluate(() => fetch('/api/novel?action=context').then(r => r.json()).then(d => d.webExtension));
    assert.equal(installed.id, 'wcshuba-public-html'); assert.equal(installed.authorization.basis, 'unverified');
    assert.equal(installed.selectors.content, '#content');
    await page.getByRole('button', { name: '移除扩展', exact: true }).click();
    await expect(page.getByRole('button', { name: '导入网页', exact: true })).toHaveCount(0);
  }
  await page.setViewportSize({ width: 600, height: 850 });
  await page.getByRole('button', { name: '校验并安装', exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await page.locator('body').evaluate(e => e.scrollWidth <= window.innerWidth + 1), true);
  await page.screenshot({ path: path.join(output, 'web-extension-narrow.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByText('创建站点扩展', { exact: true }).click();
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '安装原创示例扩展', exact: true }).click();
  await page.getByText('网页扩展 · 原创示例 · 灯塔来信', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'web-extension-downloads.png') });
  const waiting = app.waitForEvent('window'); await page.getByRole('link', { name: '扩展安装与制作', exact: true }).click();
  const help = await waiting; await help.waitForLoadState('domcontentloaded');
  await expect(help.getByRole('heading', { name: '小说安装与排错', exact: true })).toBeAttached();
  await expect(help.getByRole('heading', { name: '网页扩展', exact: true })).toBeVisible();
  assert.ok(help.url().endsWith('/help/novel#web-extension'));
  await help.screenshot({ path: path.join(output, 'novel-help.png') });
  await help.close();
  assert.deepEqual(errors, []);
  const result = { packaged: !!process.env.RM_TEST_APP, installCancel: true, oneClick: true, downloadableZip: true, zipImport: true, customAdapter: true, unverifiedSource: true, externalPackage: !!process.env.RM_TEST_EXTERNAL_EXTENSION, invalidPackagePreservesInstalled: true, nativeHelpWindow: true, narrowLayout: true, realWeb, errors };
  fs.writeFileSync(path.join(output, process.env.RM_TEST_APP ? 'web-extension-packaged.json' : 'web-extension-desktop.json'), JSON.stringify(result, null, 2)); console.log(result);
} catch (error) {
  for (const [index, page] of app.windows().entries()) {
    await page.screenshot({ path: path.join(output, `extension-failure-${index}.png`) }).catch(() => {});
    fs.writeFileSync(path.join(output, `extension-failure-${index}.txt`), `${page.url()}\n${await page.locator('body').innerText().catch(() => '')}`);
  }
  throw error;
} finally {
  await app.close();
  fs.writeFileSync(path.join(output, 'extension-desktop.log'), logs.join(''));
}
