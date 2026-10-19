import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { closeDb, getSqlite } from "../../src/lib/db";
import { createProfile, getActiveProfileId, setActiveProfile } from "../../src/lib/profiles";
import { scanFolder, syncSeriesImages } from "../../src/lib/scanner";
import { readHikariSources } from "../../src/lib/hikari-metadata";
import type { MediaType } from "../../src/lib/types";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rm-hikari-import-"));
process.env.RESOURCES_MANAGER_DATA = path.join(temp, "data");
after(() => { closeDb(); fs.rmSync(temp, { recursive: true, force: true }); });
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
type Item = { id: string; series_id: string; path: string; title: string; metadata: string | null; progress: number; rating: number; thumbnail_path: string | null };
function item(file: string) { return getSqlite().prepare("SELECT * FROM media_items WHERE path=?").get(file) as Item; }
function tags(seriesId: string) {
  return (getSqlite().prepare("SELECT t.name FROM tags t JOIN series_tags s ON t.id=s.tag_id WHERE s.series_id=? ORDER BY t.name").all(seriesId) as { name: string }[]).map((t) => t.name);
}
function folder(name: string, files: string[]) {
  const dir = path.join(temp, name); fs.mkdirSync(dir, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(dir, f), f.endsWith(".png") ? png : "第一章 测试\n原创测试文本。");
  return dir;
}
function source(dir: string, key: string, files: unknown[], extra: Record<string, unknown> = {}) {
  const url = `https://example.invalid/${key}`, id = createHash("sha256").update(url).digest("hex").slice(0, 24);
  const data = { kind: "hikari-download", schema_version: 1, source_id: id, source_url: url,
    site: "example.invalid", title: "下载器标题", authors: ["下载作者"], tags: ["站点标签"], user_tags: ["用户来源标签"],
    download: { state: "interrupted", percent: 50, total_files: 0, completed_files: files.length },
    updated_at: "2026-10-18T00:00:10+00:00", files, ...extra };
  const file = path.join(dir, `hikari-source-${id}.json`); fs.writeFileSync(file, JSON.stringify(data));
  return { data, file, id };
}

test("所有媒体分支：普通导入与已有项重新扫描均读取来源，保留用户信息", async (t) => {
  for (const [type, files] of [
    ["photo", ["one.png"]], ["video", ["one.mp4"]], ["manga", ["one.png", "archive.cbz"]],
    ["webtoon", ["one.png", "archive.cbz"]], ["novel", ["one.txt"]],
  ] as [MediaType, string[]][]) await t.test(type, async () => {
    const dir = folder(`media-${type}`, files);
    const sidecar = source(dir, type, files.map((f) => ({ path: f, tags: ["文件标签"] })));
    const first = await scanFolder(dir, type); assert.deepEqual(first.errors, []); assert.equal(first.added, files.length);
    for (const f of files) {
      const row = item(path.join(dir, f)); assert.equal(readHikariSources(row.metadata)[0].id, sidecar.id);
      const metadata = { videoPreferences: { volume: .4, rate: 1.5 }, novelPreferences: { voiceId: 4 }, other: "保留", hikari: { custom: true, sources: readHikariSources(row.metadata).map((s) => ({ ...s, future: "保留" })) } };
      getSqlite().prepare("UPDATE media_items SET title='自定义标题',progress=.42,rating=4,metadata=? WHERE id=?").run(JSON.stringify(metadata), row.id);
      const customThumb = path.join(temp, `custom-cover-${type}.webp`); fs.writeFileSync(customThumb, "custom");
      getSqlite().prepare("UPDATE series SET title='自定义系列',rating=5,progress=.3,thumbnail_path=? WHERE id=?").run(customThumb, row.series_id);
    }
    fs.writeFileSync(sidecar.file, JSON.stringify({ ...sidecar.data, title: "更新标题", tags: ["新增标签"], download: { state: "completed", percent: 100 }, updated_at: "2026-10-18T01:00:00Z" }));
    const second = await scanFolder(dir, type); assert.equal(second.added, 0); assert.deepEqual(second.errors, []);
    await scanFolder(dir, type);
    for (const f of files) {
      const row = item(path.join(dir, f)); const metadata = JSON.parse(row.metadata!);
      assert.equal(row.title, "自定义标题"); assert.equal(row.progress, .42); assert.equal(row.rating, 4);
      assert.deepEqual(metadata.videoPreferences, { volume: .4, rate: 1.5 }); assert.deepEqual(metadata.novelPreferences, { voiceId: 4 });
      assert.equal(metadata.other, "保留"); assert.equal(metadata.hikari.custom, true); assert.equal(metadata.hikari.sources[0].future, "保留");
      assert.equal(metadata.hikari.sources.length, 1); assert.equal(metadata.hikari.sources[0].downloadState, "completed");
      assert.equal(metadata.hikari.sources[0].title, "更新标题");
      assert.deepEqual(tags(row.series_id), ["文件标签", "新增标签", "用户来源标签", "站点标签"].sort());
      const series = getSqlite().prepare("SELECT title,rating,progress,thumbnail_path FROM series WHERE id=?").get(row.series_id);
      assert.deepEqual(series, { title: "自定义系列", rating: 5, progress: .3, thumbnail_path: path.join(temp, `custom-cover-${type}.webp`) });
    }
  });
});

test("共目录的来源不串文件，原有系列标签保留，同一文件可有多来源", async () => {
  const dir = folder("multi-source", ["one.png", "two.png", "three.png"]);
  const a = source(dir, "multi-a", [{ path: "one.png", source_url: "https://example.invalid/work/one", tags: ["一号"] }]);
  const b = source(dir, "multi-b", [{ path: "two.png" }], { tags: ["二号"] });
  source(dir, "multi-c", [{ path: "one.png" }]);
  await scanFolder(dir, "photo");
  assert.equal(readHikariSources(item(path.join(dir, "one.png")).metadata).length, 2);
  assert.equal(readHikariSources(item(path.join(dir, "two.png")).metadata)[0].id, b.id);
  assert.equal(readHikariSources(item(path.join(dir, "three.png")).metadata).length, 0);
  assert.equal(readHikariSources(item(path.join(dir, "one.png")).metadata).find((s) => s.id === a.id)?.sourceUrl, "https://example.invalid/work/one");
  const sid = item(path.join(dir, "one.png")).series_id;
  getSqlite().prepare("INSERT INTO tags(id,name,created_at) VALUES('manual-tag','自设标签',0)").run();
  getSqlite().prepare("INSERT INTO series_tags(series_id,tag_id) VALUES(?,'manual-tag')").run(sid);
  await scanFolder(dir, "photo");
  assert.ok(tags(sid).includes("自设标签")); assert.equal(tags(sid).length, new Set(tags(sid)).size);
});

test("照片增量同步补入新图；没有新图时仍更新已有来源及标签", async () => {
  const dir = folder("incremental", ["one.png", "two.png.part"]);
  const sidecar = source(dir, "incremental", [{ path: "one.png" }]);
  const bytes = fs.readFileSync(sidecar.file);
  await scanFolder(dir, "photo"); const row = item(path.join(dir, "one.png"));
  assert.deepEqual(fs.readFileSync(sidecar.file), bytes);
  fs.writeFileSync(path.join(dir, "two.png"), png);
  fs.writeFileSync(sidecar.file, JSON.stringify({ ...sidecar.data, files: [{ path: "one.png" }, { path: "two.png" }], download: { state: "completed", percent: 100 } }));
  const sync = await syncSeriesImages(row.series_id); assert.equal(sync.added, 1); assert.equal(sync.updated, 1); assert.deepEqual(sync.errors, []);
  assert.equal(readHikariSources(item(path.join(dir, "two.png")).metadata)[0].downloadState, "completed");
  assert.equal((getSqlite().prepare("SELECT count(*) AS n FROM media_items WHERE series_id=?").get(row.series_id) as { n: number }).n, 2);
  fs.writeFileSync(sidecar.file, JSON.stringify({ ...sidecar.data, tags: ["后补标签"], files: [{ path: "one.png" }, { path: "two.png" }] }));
  const update = await syncSeriesImages(row.series_id); assert.equal(update.added, 0); assert.equal(update.updated, 2); assert.ok(tags(row.series_id).includes("后补标签"));
  assert.equal((await syncSeriesImages(row.series_id)).updated, 0);
});

test("重新扫描和手动分组同步的标签归当前系列，不搬动文件", async () => {
  const dir = folder("manual-group", ["one.png"]); await scanFolder(dir, "photo");
  const row = item(path.join(dir, "one.png"));
  getSqlite().prepare("INSERT INTO series(id,title,media_type,manual_group,created_at,updated_at) VALUES('group','手动组','photo',1,0,0)").run();
  getSqlite().prepare("UPDATE media_items SET series_id='group' WHERE id=?").run(row.id);
  source(dir, "group", [{ path: "one.png" }]);
  await scanFolder(dir, "photo");
  assert.equal(item(row.path).series_id, "group"); assert.ok(tags("group").includes("站点标签"));
  fs.writeFileSync(path.join(dir, "unrelated.png"), png);
  assert.equal((await syncSeriesImages("group")).added, 0);
  assert.equal(item(path.join(dir, "unrelated.png")), undefined);
});

test("文件夹移动后重建库可以复用旁车 JSON，工作区互不串数据", async () => {
  const dir = folder("move-library", ["one.png"]); source(dir, "move", [{ path: "one.png" }]);
  await scanFolder(dir, "photo"); const original = getActiveProfileId();
  const moved = path.join(temp, "moved-library"); fs.renameSync(dir, moved);
  const profile = createProfile("独立测试"); setActiveProfile(profile.id);
  try {
    assert.equal((getSqlite().prepare("SELECT count(*) AS n FROM media_items").get() as { n: number }).n, 0);
    const scan = await scanFolder(moved, "photo"); assert.equal(scan.added, 1);
    assert.equal(readHikariSources(item(path.join(moved, "one.png")).metadata).length, 1);
    assert.deepEqual(tags(item(path.join(moved, "one.png")).series_id), ["用户来源标签", "站点标签"].sort());
  } finally { setActiveProfile(original); }
});

test("扫描与增量同步跳过无效来源、路径越界和未完成文件，不影响普通媒体", async () => {
  const dir = folder("invalid-integration", ["one.png", "two.png", "three.png.part"]);
  source(dir, "bad-version", [{ path: "one.png" }], { schema_version: 99 });
  const outside = path.join(temp, "private.png"); fs.writeFileSync(outside, png);
  fs.symlinkSync(outside, path.join(dir, "escape.png"));
  source(dir, "bad-path", [{ path: "../private.png" }, { path: outside }, { path: "escape.png" }, { path: "three.png.part" }]);
  const bad = source(dir, "bad-json", [{ path: "two.png" }]); fs.writeFileSync(bad.file, "bad JSON");
  const first = await scanFolder(dir, "photo"); assert.deepEqual(first.errors, []);
  const row = item(path.join(dir, "one.png"));
  for (const f of ["one.png", "two.png", "escape.png"]) assert.equal(item(path.join(dir, f)).metadata, null);
  assert.equal(item(path.join(dir, "three.png.part")), undefined);
  const sync = await syncSeriesImages(row.series_id); assert.deepEqual(sync.errors, []); assert.equal(sync.updated, 0);
  source(dir, "late-manifest", [{ path: "one.png" }]);
  const updated = await syncSeriesImages(row.series_id); assert.equal(updated.added, 0); assert.equal(updated.updated, 1);
  assert.equal(readHikariSources(item(row.path).metadata).length, 1);
});

test("无联合唯一约束的旧标签关联表重复扫描不产生重复；损坏 metadata 不覆盖", async () => {
  const db = getSqlite();
  db.exec("ALTER TABLE series_tags RENAME TO old_series_tags; CREATE TABLE series_tags(series_id TEXT NOT NULL,tag_id TEXT NOT NULL); INSERT INTO series_tags SELECT * FROM old_series_tags; DROP TABLE old_series_tags;");
  const dir = folder("old-db", ["one.png"]); await scanFolder(dir, "photo");
  const row = item(path.join(dir, "one.png"));
  for (const metadata of ["{bad JSON", "null", "[]", '{"hikari":"legacy"}', '{"hikari":{"sources":5}}']) {
    db.prepare("UPDATE media_items SET metadata=? WHERE id=?").run(metadata, row.id);
    source(dir, "legacy", [{ path: "one.png" }]);
    assert.deepEqual((await scanFolder(dir, "photo")).errors, []); assert.equal(item(row.path).metadata, metadata);
  }
  db.prepare("UPDATE media_items SET metadata=NULL WHERE id=?").run(row.id);
  await scanFolder(dir, "photo"); await scanFolder(dir, "photo"); await syncSeriesImages(row.series_id);
  assert.equal(tags(row.series_id).length, 2);
  assert.equal((db.prepare("SELECT count(*) AS n FROM (SELECT series_id,tag_id,count(*) AS c FROM series_tags GROUP BY series_id,tag_id HAVING c>1)").get() as { n: number }).n, 0);
});
