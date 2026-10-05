import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import demo from "../../src/lib/novel/extension-demo.json";
import { buildExampleExtensionPackage, parseExtensionPackage } from "../../src/lib/novel/extension-package";
import { parseWebChapter } from "../../src/lib/novel/web-import";
import { validateWebExtension } from "../../src/lib/novel/web-extensions";
import { EXAMPLE_CHAPTER_URL } from "../../src/lib/novel/extension-downloads";

test("示例 ZIP 可安装，JSON 与 ZIP 内容相同且构建可重复", async () => {
  const zip = await buildExampleExtensionPackage();
  assert.deepEqual(await parseExtensionPackage(zip, "demo.zip"), validateWebExtension(demo));
  assert.deepEqual(await parseExtensionPackage(Buffer.from(JSON.stringify(demo)), "demo.json"), validateWebExtension(demo));
  assert.deepEqual(await buildExampleExtensionPackage(), zip);
  const entries = await JSZip.loadAsync(zip); assert.deepEqual(Object.keys(entries.files), ["manifest.json", "README.md", "LICENSE"]);
});
test("示例正文与续章规则有实际页面，书籍去重键一致", () => {
  const ext = validateWebExtension(demo), root = path.resolve("docs/web-extension-demo");
  const first = parseWebChapter(fs.readFileSync(path.join(root, "chapter-1.html"), "utf8"), EXAMPLE_CHAPTER_URL, ext);
  const second = parseWebChapter(fs.readFileSync(path.join(root, "chapter-2.html"), "utf8"), first.nextURL!, ext);
  assert.equal(first.bookTitle, "灯塔来信"); assert.match(first.text, /旧信箱/);
  assert.equal(first.sourceKey, second.sourceKey); assert.equal(second.nextURL, undefined);
  assert.match(first.nextURL!, /chapter-2\.html$/);
});
test("拒绝代码、路径穿越、子目录和符号链接", async () => {
  for (const [name, options] of [["install.js", {}], ["../manifest.json", {}], ["folder/manifest.json", {}], ["manifest.json", { unixPermissions: 0o120777 }]] as const) {
    const zip = new JSZip(); zip.file("manifest.json", JSON.stringify(demo)); zip.file(name, "invalid", options);
    await assert.rejects(() => parseExtensionPackageBuffer(zip), /只允许|数量/);
  }
});
test("限制压缩前后大小，拒绝无声明包和非 JSON/ZIP", async () => {
  await assert.rejects(() => parseExtensionPackage(Buffer.alloc(256 * 1024 + 1), "a.zip"), /256 KB/);
  await assert.rejects(() => parseExtensionPackage(Buffer.alloc(32 * 1024 + 1), "a.json"), /32 KB/);
  const zip = new JSZip(); zip.file("manifest.json", " ".repeat(1024 * 1024));
  await assert.rejects(() => parseExtensionPackageBuffer(zip), /32 KB/);
  const missing = new JSZip(); missing.file("README.md", "demo"); await assert.rejects(() => parseExtensionPackageBuffer(missing), /缺少/);
  await assert.rejects(() => parseExtensionPackage(Buffer.from("{}"), "install.sh"), /JSON 或 ZIP/);
});
async function parseExtensionPackageBuffer(zip: JSZip) {
  return parseExtensionPackage(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", platform: "UNIX" }), "test.zip");
}
