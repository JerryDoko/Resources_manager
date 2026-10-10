import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateWebExtension } from "../../src/lib/novel/web-extensions";
import { assertChapterPage, parseWebChapter } from "../../src/lib/novel/web-import";
const fixture = validateWebExtension({
  format: "resources-manager.web-novel.v1", id: "ixdzs8-browser", name: "结构测试", version: "1.0.0", license: "MIT",
  authorization: { basis: "unverified", statement: "此处仅用于网页提取协议的合成结构测试，未声明任何网站作品授权。", reference: "https://ixdzs8.com/read/132445/p4077.html" },
  origins: ["https://ixdzs8.com", "https://www.ixdzs8.com"], transport: "browser",
  selectors: { content: "article.page-content > section", title: "h1.page-d-name", bookTitle: ".read-opt-more a[href^='/read/']", bookLink: ".read-opt-more a[href^='/read/']", next: "a.chapter-next" },
});
if (fixture.transport === "json") throw new Error("Expected HTML fixture");
const adapterPath = (site: string) => `${process.env.RM_TEST_ADAPTER_DIR||"../novel-web-extensions/adapters"}/${site}/manifest.json`;
const manifest = (site: string) => fs.existsSync(adapterPath(site)) ? validateWebExtension(JSON.parse(fs.readFileSync(adapterPath(site), "utf8"))) : fixture;
const text = "这是本项目原创的结构测试文字，测试章节朗读、自动续章、段落保留及去重。此处不包含任何网站上的真实小说正文。";
test("爱下电子书独立规则匹配已观察结构，正文不混入重复标题与导航", () => {
  const ext = manifest("ixdzs8");
  const html = `<h1 class="page-d-name">第二章 测试</h1><article class="page-content"><h3>第二章 测试</h3><section><p>${text}</p><p>“下一段继续。”</p><script>bad()</script></section></article><div class="chapter-act"><a class="chapter-pre" href="p1.html">上一章</a><a href="/read/132445/">书籍页</a><a class="chapter-next" href="p3.html">下一章</a></div><div class="read-opt-more"><a href="/">首页</a><a href="/read/132445/">合成测试书</a></div>`;
  const result = parseWebChapter(html, "https://ixdzs8.com/read/132445/p2.html", ext);
  assert.equal(result.bookTitle, "合成测试书"); assert.equal(result.title, "第二章 测试");
  assert.equal(result.sourceKey, "https://ixdzs8.com/read/132445/");
  assert.equal(result.nextURL, "https://ixdzs8.com/read/132445/p3.html");
  assert.ok(result.text.includes(text)); assert.ok(!result.text.includes("测试书")); assert.ok(!result.text.includes("bad()"));
  assert.equal(ext.transport, "browser"); assert.equal(ext.authorization.basis, "unverified");
  const last = parseWebChapter(html.replace('class="chapter-next" href="p3.html"', 'class="chapter-next" href="/read/132445/"'), "https://ixdzs8.com/read/132445/p2.html", ext);
  assert.equal(last.nextURL, undefined);
  assert.throws(() => parseWebChapter(html.replace('href="p3.html"', 'href="https://evil.example/next"'), "https://ixdzs8.com/read/132445/p2.html", ext), /未授权/);
});
test("69书吧规则匹配已观察结构，目录稳定且排除页面信息和广告", { skip: !fs.existsSync(adapterPath("69shuba")) }, () => {
  const ext = manifest("69shuba");
  assert.equal(ext.transport, "browser"); assert.equal(ext.authorization.basis, "unverified");
  const html = `<div class="bread"><a href="/">首页</a><a href="/book/20503.htm">原创测试书</a></div><div class="txtnav"><h1>第一章 测试</h1><div class="txtinfo">日期作者信息</div>${text}<br>下一段。<div class="contentadv">广告</div><div class="bottom-ad">底部广告</div></div><div class="page1"><a href="/txt/20503/2">下一章</a><a href="/book/20503/">目录</a></div>`;
  const result = parseWebChapter(html, "https://www.69shuba.com/txt/20503/1", ext);
  assert.equal(result.bookTitle, "原创测试书"); assert.equal(result.title, "第一章 测试");
  assert.equal(result.sourceKey, "https://www.69shuba.com/book/20503/");
  assert.equal(result.nextURL, "https://www.69shuba.com/txt/20503/2");
  assert.ok(result.text.includes(text)); assert.doesNotMatch(result.text, /第一章|日期作者信息|广告/);
  assert.equal(parseWebChapter(html.replace('href="/txt/20503/2"', 'href="/book/20503/"'), "https://www.69shuba.com/txt/20503/1", ext).nextURL, undefined);
});
test("可选独立扩展与主程序合成结构协议保持一致", { skip: !fs.existsSync(adapterPath("ixdzs8")) }, () => {
  const ext = manifest("ixdzs8"); if (ext.transport === "json") throw new Error("Expected HTML extension");
  assert.deepEqual(ext.selectors, fixture.selectors);
});
test("验证码或浏览器验证页不得当作小说保存", () => {
  for (const html of ['<title>正在验证浏览器</title><p>请稍等</p>', '<title>Just a moment...</title>', '<title>小说</title><div id="challenge-stage"></div>', '<script src="/cdn-cgi/challenge-platform/run.js"></script>']) {
    assert.throws(() => assertChapterPage(html), /安全验证页/);
    assert.throws(() => parseWebChapter(html, "https://ixdzs8.com/read/132445/p2.html", manifest("ixdzs8")), /安全验证页/);
  }
  assert.doesNotThrow(() => assertChapterPage(`<title>第一章</title><article>${text}</article>`));
});
test("网页读取方式只允许声明式传输选项", () => {
  assert.throws(() => validateWebExtension({ ...manifest("ixdzs8"), transport: "execute-script" }));
});
test("ESJ 会员登录页不能误存成章节", () => {
  assert.throws(() => assertChapterPage('<title>會員登入/註冊 - ESJ Zone</title><form class="login-box"></form>'), /会员登录/);
});
test("正文与评论分离，排除侧栏、表单、导航、广告且不漏段落", () => {
  const ext = validateWebExtension({ ...fixture, selectors: { content: '.forum-content', title: 'h2', bookTitle: '.breadcrumb a', bookLink: '.breadcrumb a', next: 'a.next', comments: '#comments .comment-body', exclude: '.ads, .comment-footer, .comments-section' } });
  const html = `<nav>首页菜单</nav><div class="breadcrumb"><a href="/read/132445/">结构测试书</a></div><h2>第一章</h2><div class="forum-content"><p>${text}</p><p>第二个段落。</p><div class="ads">广告文字</div><form>评论输入框<textarea>未发送评论</textarea></form><section id="comments" class="comments-section"><div class="comment-body"><div class="comment-header">读者甲</div><p>第一条评论。</p><div class="comment-footer">举报回复</div></div><div class="comment-body"><p>第二条评论。<br>换行。</p><script>bad()</script></div></section></div><aside>内容标签 最新更新 推荐书籍</aside><a class="next" href="p2.html">下一章</a>`;
  const result = parseWebChapter(html, 'https://ixdzs8.com/read/132445/p1.html', ext);
  assert.ok(result.text.includes(text)); assert.ok(result.text.includes('第二个段落'));
  assert.doesNotMatch(result.text, /评论|广告|菜单|推荐|内容标签|举报|bad/);
  assert.equal(result.comments?.length, 2); assert.match(result.comments![0], /读者甲[\s\S]*第一条评论/);
  assert.match(result.comments![1], /第二条评论。\n换行。/); assert.doesNotMatch(result.comments!.join(''), /举报|回复|bad/);
  assert.equal(result.nextURL, 'https://ixdzs8.com/read/132445/p2.html');
  const absent = parseWebChapter(html.replace(/id="comments"/g, 'id="empty"'), 'https://ixdzs8.com/read/132445/p1.html', ext);
  assert.deepEqual(absent.comments, []); assert.equal(absent.text, result.text);
});
test("ESJ 书名不限定在面包屑，缺失标题不丢弃有效正文，续章来源键稳定", {skip:!fs.existsSync(adapterPath('esjzone'))}, () => {
  const ext=manifest('esjzone');
  const body=`<div class="forum-detail"><h2>第一章 结构测试</h2><div class="forum-content"><p>${text}</p></div><a href="/detail/1748671322.html">原创结构测试书</a><a href="/forum/1748671322/379458.html">下一篇</a></div>`;
  const first=parseWebChapter(body,'https://www.esjzone.cc/forum/1748671322/379457.html',ext);
  assert.equal(first.bookTitle,'原创结构测试书');assert.equal(first.title,'第一章 结构测试');
  assert.equal(first.nextURL,'https://www.esjzone.cc/forum/1748671322/379458.html');
  assert.deepEqual(first.comments,[]);
  const next=parseWebChapter(`<title>第二章 结构测试</title><div class="forum-content">${text}</div>`,'https://www.esjzone.cc/forum/1748671322/379458.html',ext);
  assert.equal(next.sourceKey,first.sourceKey);assert.equal(next.title,'第二章 结构测试');
  assert.equal(next.bookTitle,'网页小说（1748671322）');assert.match(next.notice!,/正文已保存/);
  assert.equal(next.text,text);
  assert.throws(()=>parseWebChapter('<title>无正文</title><div class="forum-content">短文本</div>','https://www.esjzone.cc/forum/1748671322/379458.html',ext),/足够的章节正文/);
});
test("章节标题支持 meta content，未启用缺失标题选项的扩展继续严格校验", () => {
  const ext=validateWebExtension({...fixture,selectors:{content:'article',title:"meta[name='chapter-title']",bookTitle:"meta[name='book-title']"}});
  const html=`<meta name="book-title" content="原创测试书"><meta name="chapter-title" content="第一章"><article>${text}</article>`;
  assert.equal(parseWebChapter(html,'https://ixdzs8.com/read/1/p1.html',ext).title,'第一章');
  assert.throws(()=>parseWebChapter(`<article>${text}</article>`,'https://ixdzs8.com/read/1/p1.html',ext),/书名或章节标题/);
});
