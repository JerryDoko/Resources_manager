import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { _electron, expect } = require(process.env.RM_PLAYWRIGHT || '/Users/hsx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/test');
const root = process.cwd();
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-hikari-desktop-'));
const folder = path.join(userData, 'Hikari 本地测试'); fs.mkdirSync(folder);
const output = path.join(root, 'test-results/hikari'); fs.mkdirSync(output, { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
for (const name of ['01.png', '02.png']) fs.writeFileSync(path.join(folder, name), png);
function sidecar(url, title, state) {
  const id = createHash('sha256').update(url).digest('hex').slice(0, 24);
  const value = { kind: 'hikari-download', schema_version: 1, source_id: id, source_url: url,
    site: 'example.invalid', engine: 'test', title, tags: ['原创测试'], authors: ['测试作者'], user_tags: ['手动标签'],
    created_at: '2026-10-18T00:00:00Z', updated_at: '2026-10-18T00:00:10Z', download: { state, percent: 50, completed_files: 1, total_files: 0 }, files: [{ path: '01.png' }] };
  const file = path.join(folder, `hikari-source-${id}.json`); fs.writeFileSync(file, JSON.stringify(value));
  return { file, value };
}
const first = sidecar('https://example.invalid/art/1', '原创来源作品', 'interrupted');
sidecar('https://example.invalid/art/2', '第二个独立来源', 'completed');
const errors = [], logs = [];
const app = await _electron.launch({
  executablePath: process.env.RM_TEST_APP || path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: process.env.RM_TEST_APP ? [] : ['electron/main.js'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', LM_MODE: 'dev', RM_NEXT_DIST_DIR: '.next-pack', PORT: '31888', RESOURCES_MANAGER_USER_DATA: userData }, timeout: 120000,
});
app.process().stdout?.on('data', data => logs.push(data.toString()));
app.process().stderr?.on('data', data => logs.push(data.toString()));
try {
  await app.evaluate(({ shell }) => {
    globalThis.__hikariOpened = [];
    shell.openExternal = async url => { globalThis.__hikariOpened.push(url); };
  });
  const page = await app.firstWindow({ timeout: 120000 });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/update/check*', route => route.fulfill({ contentType: 'application/json', body: '{"updateAvailable":false,"currentVersion":"1.2.2","latestVersion":"1.2.2"}' }));
  await page.waitForLoadState('domcontentloaded');
  const added = await page.evaluate(async folder => {
    const r = await fetch('/api/folders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', path: folder, mediaType: 'photo' }) });
    const value = await r.json(); if (!r.ok) throw new Error(value.error); return value;
  }, folder);
  assert.equal(added.scan.added, 2); assert.deepEqual(added.scan.errors, []);
  await page.getByRole('button', { name: /^照片\s+\d/ }).click();
  await page.locator('[data-series-card]').filter({ hasText: 'Hikari 本地测试' }).click();
  await expect(page.locator('[data-item-row]')).toHaveCount(2);
  await page.locator('[data-item-row]').first().getByRole('button').nth(1).click();
  await expect(page.getByRole('heading', { name: '下载来源 · 2' })).toBeVisible();
  await expect(page.getByText('下载已中断', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '打开来源' })).toHaveCount(2);
  assert.deepEqual(await app.evaluate(() => globalThis.__hikariOpened), []);
  await page.getByRole('link', { name: '打开来源' }).filter({ has: page.locator('svg') }).first().click();
  await expect.poll(() => app.evaluate(() => globalThis.__hikariOpened.length)).toBe(1);
  assert.match((await app.evaluate(() => globalThis.__hikariOpened))[0], /^https:\/\/example\.invalid\/art\/[12]$/);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('heading', { name: '下载来源 · 2' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'source-detail-desktop.png') });
  await page.setViewportSize({ width: 600, height: 850 });
  await page.getByRole('heading', { name: '下载来源 · 2' }).scrollIntoViewIfNeeded();
  assert.equal(await page.locator('body').evaluate(e => e.scrollWidth <= window.innerWidth + 1), true);
  await page.screenshot({ path: path.join(output, 'source-detail-narrow.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-item-row]').nth(1).getByRole('button').nth(1).click();
  await expect(page.getByRole('heading', { name: /下载来源/ })).toHaveCount(0);
  fs.writeFileSync(first.file, JSON.stringify({ ...first.value, title: '同步后的来源标题', tags: ['新增来源标签'], download: { state: 'completed', percent: 100 } }));
  await page.getByRole('button', { name: '返回库', exact: true }).click();
  await page.locator('[data-series-card]').filter({ hasText: 'Hikari 本地测试' }).click();
  await expect(page.getByText('新增来源标签', { exact: true }).last()).toBeVisible();
  await page.locator('[data-item-row]').first().getByRole('button').nth(1).click();
  await expect(page.getByText('同步后的来源标题', { exact: true })).toBeVisible();
  await expect(page.getByText('下载已中断', { exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  const result = { packaged: !!process.env.RM_TEST_APP, import: true, multiSource: true, explicitExternalOpen: true, unmatchedHidden: true, noNewFilesRefresh: true, narrowLayout: true, errors };
  fs.writeFileSync(path.join(output, process.env.RM_TEST_APP ? 'packaged.json' : 'desktop.json'), JSON.stringify(result, null, 2)); console.log(result);
} catch (error) {
  for (const [i, page] of app.windows().entries()) {
    await page.screenshot({ path: path.join(output, `failure-${i}.png`) }).catch(() => {});
    fs.writeFileSync(path.join(output, `failure-${i}.txt`), await page.locator('body').innerText().catch(() => ''));
  }
  throw error;
} finally {
  await app.close();
  fs.writeFileSync(path.join(output, 'desktop.log'), logs.join(''));
  fs.rmSync(userData, { recursive: true, force: true });
}
