import test from "node:test";
import assert from "node:assert/strict";
import { validateWebExtension } from "../../src/lib/novel/web-extensions";
import { assertJSONResponseURL, jsonRequestURL, parseWebJSONChapter } from "../../src/lib/novel/web-json";
const manifest = {
  format: "resources-manager.web-novel.v1", id: "json-test", name: "原创接口测试", version: "1.0.0", license: "MIT",
  authorization: { basis: "unverified", statement: "此扩展只用于原创结构测试，不声明任何第三方小说或译文授权。", reference: "https://example.org/rights" },
  origins: ["https://example.org"], transport: "json",
  json: { pathPrefix: "/novel/", request: "/api/novel/{0}/{1}/chapter/{2}", bookURL: "/novel/{0}/{1}", nextURL: "/novel/{0}/{1}/{next}", title: ["titleZh", "titleJp"], bookTitle: ["novelTitleZh", "novelTitleJp"], content: ["sakuraParagraphs", "youdaoParagraphs"], next: "nextId" },
};
const extension = validateWebExtension(manifest);
if (extension.transport !== "json") throw new Error("Expected JSON extension");
const source = "https://example.org/novel/hameln/427866/1";
const text = "这是一段本项目原创的接口结构测试正文，用于验证段落保留、翻章编号与不同译文的选择，不来自网站小说。";
const chapter = { titleZh: "第一章", titleJp: "chapter one", novelTitleZh: "原创测试书", nextId: "7", sakuraParagraphs: [text, "", "下一段"], youdaoParagraphs: [text + "备用"] };
test("公开 JSON 接口读取中文、按实际编号续章，使用稳定书籍键", () => {
  assert.equal(jsonRequestURL(source, extension), "https://example.org/api/novel/hameln/427866/chapter/1");
  const result = parseWebJSONChapter(JSON.stringify(chapter), source, extension);
  assert.equal(result.title, "第一章"); assert.equal(result.bookTitle, "原创测试书");
  assert.equal(result.text, text + "\n\n下一段");
  assert.equal(result.sourceKey, "https://example.org/novel/hameln/427866");
  assert.equal(result.sourceURL, source); assert.equal(result.nextURL, "https://example.org/novel/hameln/427866/7");
  const fallback = parseWebJSONChapter(JSON.stringify({ ...chapter, sakuraParagraphs: [] }), source, extension);
  assert.equal(fallback.text, text + "备用");
});
test("无译文不默读其他语言；末章、当前章、无效 JSON 明确处理", () => {
  assert.throws(() => parseWebJSONChapter(JSON.stringify({ ...chapter, sakuraParagraphs: [], youdaoParagraphs: [], paragraphs: [text] }), source, extension), /没有.*译文/);
  for (const nextId of [null, "", undefined, "1"]) assert.equal(parseWebJSONChapter(JSON.stringify({ ...chapter, nextId }), source, extension).nextURL, undefined);
  for (const raw of ["<html>登录页</html>", "null", "[]"]) assert.throws(() => parseWebJSONChapter(raw, source, extension));
  assert.throws(() => parseWebJSONChapter(JSON.stringify({ ...chapter, titleZh: "", titleJp: "" }), source, extension), /标题/);
});
test("接口模板不扩大域名权限、拒绝无效路径和恶意下一章编号", () => {
  const request = jsonRequestURL(source, extension);
  assert.doesNotThrow(() => assertJSONResponseURL(request, request));
  assert.throws(() => assertJSONResponseURL(request, request.replace('/chapter/1', '/chapter/2')), /跳转/);
  for (const url of ["https://127.0.0.1/novel/hameln/427866/1", "https://example.org/other/hameln/427866/1", "https://example.org/novel/hameln/427866", "https://example.org/novel/hameln/427866/%2Fadmin"]) assert.throws(() => jsonRequestURL(url, extension));
  for (const nextId of ["https://evil.example", "../admin", "x/y", true, {}, -1]) assert.throws(() => parseWebJSONChapter(JSON.stringify({ ...chapter, nextId }), source, extension));
  for (const request of ["https://evil.example", "//evil.example/{0}", "/api/{next}"]) {
    const value = { ...manifest, json: { ...manifest.json, request } };
    if (request.startsWith("//")) {
      const ext = validateWebExtension(value); if (ext.transport !== "json") throw new Error("Expected JSON");
      assert.throws(() => jsonRequestURL(source, ext), /其他网站/);
    } else assert.throws(() => validateWebExtension(value));
  }
  assert.throws(() => validateWebExtension({ ...manifest, script: "run()" }));
});
