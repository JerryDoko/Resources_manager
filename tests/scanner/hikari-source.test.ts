import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createHikariSourceReader, MAX_HIKARI_JSON_BYTES } from "../../src/lib/scanner/hikari-source";
import { hikariSourceUrl, readHikariSources } from "../../src/lib/hikari-metadata";

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "rm-hikari-reader-"));
after(() => fs.rmSync(temp, { recursive: true, force: true }));
function fixture(name: string) {
  const folder = path.join(temp, name);
  fs.mkdirSync(folder, { recursive: true });
  for (const file of ["one.jpg", "two.jpg", "three.jpg", "unfinished.jpg.part"]) fs.writeFileSync(path.join(folder, file), "fixture");
  return folder;
}
function source(folder: string, url: string, files: unknown[], extra: Record<string, unknown> = {}) {
  const id = createHash("sha256").update(url).digest("hex").slice(0, 24);
  const data = { kind: "hikari-download", schema_version: 1, source_id: id, source_url: url,
    site: "example.invalid", title: "来源标题", authors: ["作者甲"], tags: ["根标签"], user_tags: ["手动来源标签"],
    updated_at: "2026-10-18T00:00:10+00:00", download: { state: "interrupted", percent: 50 }, files, ...extra };
  const file = path.join(folder, `hikari-source-${id}.json`);
  fs.writeFileSync(file, JSON.stringify(data));
  return { id, data, file };
}

test("多来源按具体文件匹配，文件 URL 优先，父目录每轮仅解析一次", () => {
  const folder = fixture("matching");
  const first = source(folder, "https://example.invalid/list", [{ path: "one.jpg", source_url: "https://example.invalid/art/1", title: "具体作品", tags: ["单图", "根标签"], authors: ["作者乙"] }]);
  const second = source(folder, "https://example.invalid/other", [{ path: "one.jpg" }, { path: "two.jpg" }]);
  const read = createHikariSourceReader();
  const one = read(path.join(folder, "one.jpg"));
  assert.equal(one.length, 2);
  const entry = one.find((s) => s.id === first.id)!;
  assert.equal(entry.sourceUrl, "https://example.invalid/art/1");
  assert.equal(entry.title, "具体作品");
  assert.deepEqual(entry.tags, ["根标签", "手动来源标签", "单图"]);
  assert.deepEqual(entry.authors, ["作者甲", "作者乙"]);
  assert.equal(entry.downloadState, "interrupted");
  assert.equal(read(path.join(folder, "two.jpg"))[0].id, second.id);
  assert.deepEqual(read(path.join(folder, "three.jpg")), []);
  fs.writeFileSync(first.file, JSON.stringify({ ...first.data, title: "新标题", files: [{ path: "three.jpg" }] }));
  assert.equal(read(path.join(folder, "one.jpg")).length, 2);
  assert.equal(createHikariSourceReader()(path.join(folder, "three.jpg"))[0].title, "新标题");
});

test("相对路径在文件夹移动后仍能匹配", () => {
  const folder = fixture("before-move");
  source(folder, "https://example.invalid/move", [{ path: "one.jpg" }]);
  const moved = path.join(temp, "after-move");
  fs.renameSync(folder, moved);
  assert.equal(createHikariSourceReader()(path.join(moved, "one.jpg"))[0].title, "来源标题");
});

test("坏 JSON、未知版本、ID 不匹配、超限文件和符号链接 JSON 被跳过", () => {
  const folder = fixture("invalid");
  const valid = source(folder, "https://example.invalid/valid", [{ path: "one.jpg" }]);
  source(folder, "https://example.invalid/version", [{ path: "one.jpg" }], { schema_version: 2 });
  source(folder, "https://example.invalid/kind", [{ path: "one.jpg" }], { kind: "not-hikari" });
  source(folder, "https://example.invalid/id", [{ path: "one.jpg" }], { source_id: "0".repeat(24) });
  fs.writeFileSync(path.join(folder, `hikari-source-${"a".repeat(24)}.json`), "{bad JSON");
  const large = path.join(folder, `hikari-source-${"b".repeat(24)}.json`);
  const fd = fs.openSync(large, "w"); fs.ftruncateSync(fd, MAX_HIKARI_JSON_BYTES + 1); fs.closeSync(fd);
  fs.symlinkSync(valid.file, path.join(folder, `hikari-source-${"c".repeat(24)}.json`));
  fs.writeFileSync(path.join(folder, "hikari-source-arbitrary.json"), JSON.stringify(valid.data));
  assert.deepEqual(createHikariSourceReader()(path.join(folder, "one.jpg")).map((s) => s.id), [valid.id]);
});

test("绝对路径、父目录穿越、Windows 路径、越界符号链接及 part 文件被拒绝", () => {
  const folder = fixture("paths");
  const outside = path.join(temp, "outside.jpg"); fs.writeFileSync(outside, "private");
  fs.symlinkSync(outside, path.join(folder, "escape.jpg"));
  fs.symlinkSync(path.join(folder, "one.jpg"), path.join(folder, "safe.jpg"));
  const input = [outside, "../outside.jpg", "..\\outside.jpg", "C:\\private\\one.jpg", "C:one.jpg", "\\\\server\\share\\one.jpg", "escape.jpg", "unfinished.jpg.part", "missing.jpg", ".", "one.jpg\0"];
  source(folder, "https://example.invalid/paths", [...input.map((p) => ({ path: p })), { path: "safe.jpg" }, { path: "one.jpg" }]);
  const read = createHikariSourceReader();
  assert.deepEqual(read(path.join(folder, "escape.jpg")), []);
  assert.deepEqual(read(path.join(folder, "unfinished.jpg.part")), []);
  assert.equal(read(path.join(folder, "safe.jpg")).length, 1);
  assert.equal(read(path.join(folder, "one.jpg")).length, 1);
});

test("来源链接仅允许 HTTP(S)，不执行内容，客户端容忍坏 metadata", () => {
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,test", "https://user:secret@example.invalid/", "invalid"]) assert.equal(hikariSourceUrl(url), "");
  assert.equal(hikariSourceUrl("https://example.invalid/作品"), "https://example.invalid/作品");
  for (const metadata of [null, "not JSON", "null", "[]", '{"hikari":{"sources":[null,3,{}]}}']) assert.deepEqual(readHikariSources(metadata), []);
  const folder = fixture("untrusted");
  source(folder, "javascript:alert(1)", [{ path: "one.jpg" }], { script: "throw new Error('must not execute')" });
  const entry = createHikariSourceReader()(path.join(folder, "one.jpg"))[0];
  assert.equal(entry.sourceUrl, "");
});
