import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { _electron, expect } = require(process.env.RM_PLAYWRIGHT || '/Users/hsx/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/test');
const root = process.cwd(), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-tags-desktop-'));
const output = path.join(root, 'test-results/tags'); fs.mkdirSync(output, { recursive: true });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
const groups = ['parody:Work ', 'character:Character ', 'tag:Landscape ', 'artist:Artist '];
function fixture(name, tags) {
  const dir = path.join(temp, name); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, '01.png'), png);
  const url = `https://example.invalid/${encodeURIComponent(name)}`, id = createHash('sha256').update(url).digest('hex').slice(0, 24);
  fs.writeFileSync(path.join(dir, `hikari-source-${id}.json`), JSON.stringify({ kind: 'hikari-download', schema_version: 1, source_id: id, source_url: url, title: name, site: 'example.invalid', tags, authors: [], user_tags: [], download: { state: 'completed' }, files: [{ path: '01.png' }] }));
  return dir;
}
const full = fixture('标签分类测试', groups.flatMap(prefix => Array.from({ length: 7 }, (_, i) => prefix + (i + 1))));
const partial = fixture('只有普通标签', ['唯一普通标签']);
const empty = fixture('没有标签', []);
const errors = [], logs = [];
const app = await _electron.launch({
  executablePath: process.env.RM_TEST_APP || path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
  args: process.env.RM_TEST_APP ? [] : ['electron/main.js'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', LM_MODE: 'dev', RM_NEXT_DIST_DIR: '.next-pack', PORT: '31889', RESOURCES_MANAGER_USER_DATA: temp }, timeout: 120000,
});
app.process().stdout?.on('data', data => logs.push(data.toString()));
app.process().stderr?.on('data', data => logs.push(data.toString()));
try {
  const page = await app.firstWindow({ timeout: 120000 });
  if (process.env.RM_TEST_APP) assert.equal(await app.evaluate(({ app }) => app.getVersion()), JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/update/check*', route => route.fulfill({ contentType: 'application/json', body: '{"updateAvailable":false,"currentVersion":"1.2.2","latestVersion":"1.2.2"}' }));
  await page.waitForLoadState('domcontentloaded');
  const request = (url, method = 'GET', body) => page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error); return data;
  }, { url, method, body });
  for (const folder of [full, partial, empty]) await request('/api/folders', 'POST', { action: 'add', path: folder, mediaType: 'photo' });
  const extra = (await request('/api/tags', 'POST', { action: 'create', name: '未关联标签' })).tag;
  await page.reload();
  await page.getByRole('button', { name: /^照片\s+\d/ }).click();
  const filter = page.getByRole('region', { name: '标签筛选', exact: true });
  await expect(filter).toHaveCount(0);
  await page.getByRole('button', { name: '标签', exact: true }).click();
  await expect(filter).toBeVisible();
  for (const key of ['work', 'character', 'general', 'author']) await expect(filter.locator(`[data-tag-category="${key}"] button[aria-pressed]`)).toHaveCount(5);
  await filter.getByRole('button', { name: '查看全部角色标签', exact: true }).click();
  await expect(filter.locator('[data-tag-category="character"] button[aria-pressed]')).toHaveCount(7);
  await filter.getByRole('button', { name: 'Landscape 1', exact: true }).click();
  await expect(page.getByRole('button', { name: '标签 · 1', exact: true })).toBeVisible();
  await filter.getByLabel('标签匹配模式').selectOption('all');
  await filter.getByRole('button', { name: '清除筛选', exact: true }).click();
  await page.getByRole('button', { name: '标签', exact: true }).click();
  await expect(filter).toHaveCount(0);
  await page.getByRole('button', { name: '标签', exact: true }).click();
  await expect(filter.locator('[data-tag-category="character"] button[aria-pressed]')).toHaveCount(5);
  await page.getByRole('button', { name: '标签', exact: true }).click();

  await page.locator('[data-series-card]').filter({ hasText: '标签分类测试' }).click();
  const section = page.getByRole('region', { name: '资源标签', exact: true });
  const detail = await request('/api/library?type=photo');
  const series = detail.items.find(s => s.title === '标签分类测试');
  const ids = async () => (await request(`/api/library/${series.id}`)).tags.map(t => t.id).sort();
  const initial = await ids(); assert.equal(initial.length, 28);
  await expect(section.getByText('未关联标签', { exact: true })).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'AI 识图标签', exact: true })).toHaveCount(0);
  for (const key of ['work', 'character', 'general', 'author']) await expect(section.locator(`[data-tag-category="${key}"] span[title]`)).toHaveCount(5);
  let patches = 0; page.on('request', request => { if (request.method() === 'PATCH' && request.url().endsWith(`/api/library/${series.id}`)) patches++; });
  await section.getByText('Landscape 1', { exact: true }).click();
  assert.equal(patches, 0); assert.deepEqual(await ids(), initial);
  await section.getByRole('button', { name: '查看全部标签', exact: true }).click();
  for (const key of ['work', 'character', 'general', 'author']) await expect(section.locator(`[data-tag-category="${key}"] span[title]`)).toHaveCount(7);
  await expect(section.getByText('未关联标签', { exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: '收起标签', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await section.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, 'detail-categories.png') });
  await page.setViewportSize({ width: 600, height: 850 });
  await section.scrollIntoViewIfNeeded();
  assert.equal(await page.locator('body').evaluate(e => e.scrollWidth <= window.innerWidth + 1), true);
  await page.screenshot({ path: path.join(output, 'detail-categories-narrow.png') });
  await page.setViewportSize({ width: 1280, height: 900 });

  await section.getByRole('button', { name: '添加 / 更改标签', exact: true }).click();
  const editor = section.getByRole('region', { name: '编辑资源标签', exact: true });
  await editor.getByLabel('搜索可选标签').fill('未关联标签');
  await editor.getByRole('button', { name: '未关联标签', exact: true }).click();
  assert.deepEqual(await ids(), initial);
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual(await ids(), initial); assert.equal(patches, 0);
  await section.getByRole('button', { name: '添加 / 更改标签', exact: true }).click();
  await editor.getByLabel('搜索可选标签').fill('未关联标签');
  await editor.getByRole('button', { name: '未关联标签', exact: true }).click();
  const failSave = route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"模拟保存失败"}' }) : route.continue();
  const pattern = `**/api/library/${series.id}`;
  await page.route(pattern, failSave);
  await editor.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(editor.getByRole('alert')).toHaveText('模拟保存失败');
  assert.deepEqual(await ids(), initial);
  await page.unroute(pattern, failSave);
  await editor.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(editor).toHaveCount(0);
  assert.deepEqual(await ids(), [...initial, extra.id].sort());
  await section.getByRole('button', { name: '添加 / 更改标签', exact: true }).click();
  await editor.getByLabel('搜索可选标签').fill('未关联标签');
  await expect(editor.getByRole('button', { name: '未关联标签', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await editor.getByRole('button', { name: '未关联标签', exact: true }).click();
  await editor.getByRole('button', { name: '保存标签', exact: true }).click();
  await expect(editor).toHaveCount(0); assert.deepEqual(await ids(), initial);

  await page.getByRole('button', { name: '返回库', exact: true }).click();
  await page.locator('[data-series-card]').filter({ hasText: '只有普通标签' }).click();
  await expect(section.locator('[data-tag-category]')).toHaveCount(1);
  await expect(section.locator('[data-tag-category="general"]')).toBeVisible();
  await page.getByRole('button', { name: '返回库', exact: true }).click();
  await page.locator('[data-series-card]').filter({ hasText: '没有标签' }).click();
  await expect(section.locator('[data-tag-category]')).toHaveCount(0);
  await expect(section.getByText('暂无标签', { exact: true })).toBeVisible();
  assert.deepEqual(errors, []);
  const result = { packaged: !!process.env.RM_TEST_APP, filterCollapsed: true, categorized: true, fivePerCategory: true, readOnly: true, assignedOnly: true, explicitSaveCancel: true, saveFailureRecoverable: true, emptyCategoriesHidden: true, narrowLayout: true, errors };
  fs.writeFileSync(path.join(output, process.env.RM_TEST_APP ? 'packaged.json' : 'desktop.json'), JSON.stringify(result, null, 2)); console.log(result);
} catch (error) {
  for (const [i, page] of app.windows().entries()) {
    await page.screenshot({ path: path.join(output, `failure-${i}.png`) }).catch(() => {});
    fs.writeFileSync(path.join(output, `failure-${i}.txt`), await page.locator('body').innerText().catch(() => ''));
  }
  throw error;
} finally {
  await app.close(); fs.writeFileSync(path.join(output, 'desktop.log'), logs.join(''));
  fs.rmSync(temp, { recursive: true, force: true });
}
