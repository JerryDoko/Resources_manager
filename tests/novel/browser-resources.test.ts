import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { allowed, allowedResource, allowedCover } = require("../../electron/novel-web-browser.cjs");
const declared = ["https://www.69shuba.com"];
test("Cloudflare 正常验证资源可加载，但不能作为章节主页面", () => {
  const url = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  for (const type of ["script", "subFrame", "xhr", "image"]) assert.equal(allowedResource(url, declared, type), true);
  assert.equal(allowedResource(url, declared, "mainFrame"), false);
  assert.equal(allowed(url, declared), false);
});
test("验证资源白名单不扩大到任意外部域名、非 HTTPS 或本地服务", () => {
  for (const url of ["http://challenges.cloudflare.com/a", "https://challenges.cloudflare.com.evil.test/a", "https://user:pass@challenges.cloudflare.com/a", "https://challenges.cloudflare.com:8443/a", "http://127.0.0.1/api/novel", "file:///etc/passwd", "https://example.org/ad.js"]) assert.equal(allowedResource(url, declared, "subFrame"), false, url);
  assert.equal(allowedResource("https://www.69shuba.com/txt/1/2", declared, "mainFrame"), true);
  assert.equal(allowedResource("https://ixdzs8.com/read/1/", declared, "mainFrame"), false);
});
test("新网站浏览器读取仍须独立安装并声明来源，不允许账号接口或任意网站", () => {
  for (const origin of ["https://n.novelia.cc", "https://www.esjzone.cc", "https://esjzone.cc"]) {
    assert.equal(allowed(`${origin}/chapter`, [origin]), true);
    assert.equal(allowed(`${origin}/chapter`, declared), false);
  }
  assert.equal(allowed("https://auth.novelia.cc/api/v1/auth/refresh", ["https://auth.novelia.cc"]), false);
  assert.equal(allowed("https://example.org/api/chapter", ["https://example.org"]), false);
});
test("ESJ 登录表单只放行实际使用的固定版本界面资源，不开放 CDN 其他脚本", () => {
  const site = ['https://www.esjzone.cc'];
  const script = 'https://cdnjs.cloudflare.com/ajax/libs/limonte-sweetalert2/6.10.1/sweetalert2.all.min.js';
  assert.equal(allowedResource(script, site, 'script'), true);
  for (const type of ['mainFrame', 'subFrame', 'xhr']) assert.equal(allowedResource(script, site, type), false);
  assert.equal(allowedResource(script, declared, 'script'), false);
  assert.equal(allowedResource(`${script}?other=true`, site, 'script'), false);
  assert.equal(allowedResource('https://cdnjs.cloudflare.com/ajax/libs/other/script.js', site, 'script'), false);
});
test("代理封面下载仅开放声明的固定 CDN 图片路径，不扩大网页权限",()=>{
  const permitted=['https://images.novelpia.com'];
  assert.equal(allowedCover('https://images.novelpia.com/imagebox/cover/test_ori.file',permitted),true);
  assert.equal(allowedCover('https://images.novelpia.com/imagebox/cover/test_ori.file',[]),false);
  for(const value of ['https://images.novelpia.com/account','https://images.novelpia.com/imagebox/cover/test.file?token=bad','http://images.novelpia.com/imagebox/cover/test.file','https://images.novelpia.com:8443/imagebox/cover/test.file','https://user:pass@images.novelpia.com/imagebox/cover/test.file','https://images.novelpia.com.evil.test/imagebox/cover/test.file','http://127.0.0.1/cover'])assert.equal(allowedCover(value,permitted),false,value);
  assert.equal(allowed('https://images.novelpia.com/imagebox/cover/test.file',permitted),false);
});
