import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { prepareSpeech } from "../../src/lib/novel/narration";
import { splitChunks, splitChapters, resolvePosition } from "../../src/lib/novel/chunks";
import { parseWebChapter, normalizeURL, publicAddress } from "../../src/lib/novel/web-import";
const fixtures=JSON.parse(fs.readFileSync("tests/novel/fixtures/narration.json","utf8")) as {name:string;input:string;expected:string}[];
for(const fixture of fixtures)test(`朗读规则: ${fixture.name}`,()=>{assert.equal(prepareSpeech(fixture.input),fixture.expected);assert.equal(prepareSpeech(prepareSpeech(fixture.input)),fixture.expected);});
test("Python 与 TypeScript 的18个规则一致",()=>{
  const python=`runtime/kokoro/bundle/${process.platform}-${process.arch}/python/${process.platform==="win32"?"python.exe":"bin/python3"}`;
  const output=execFileSync(python,["-c","import sys,json;sys.path.insert(0,'runtime/kokoro');from narration import prepare;print(json.dumps([prepare(x['input']) for x in json.load(sys.stdin)],ensure_ascii=False))"],{input:JSON.stringify(fixtures),encoding:"utf8"});
  assert.deepEqual(JSON.parse(output),fixtures.map(f=>f.expected));
});
test("Unicode 原文锚点和分段重定位",()=>{
  const text='  他说：“回来。”\n'+"甲😀".repeat(200)+"\n＊＊＊\n第二章 归来\n繁體內容。";
  const chapters=splitChapters(text);assert.equal(chapters.length,2);
  for(const chunk of splitChunks(text)){assert.equal(text.slice(chunk.start,chunk.end),chunk.text);assert.ok(Array.from(chunk.text).length<=240);assert.ok(!/[\uD800-\uDBFF]$/.test(chunk.text));}
  const chapter=chapters[0],c=chapter.chunks[0];const position={chapterId:chapter.id,chunkId:c.id,offset:c.start,digest:c.digest,seconds:1.2,chunkVersion:1};
  assert.equal(resolvePosition(chapter,position).seconds,1.2);
  const changed=splitChapters("新增序言\n"+text)[0];assert.equal(resolvePosition(changed,position).index,1);assert.equal(resolvePosition(changed,position).changed,true);
  assert.equal(splitChunks("＊＊＊ —— ……")[0].speech,"");
});
test("固定网页提取保留对白、正文作者字样和下一章",()=>{
  const html='<html><head><meta property="og:novel:book_name" content="样例书"></head><body><a id="info_url" href="/book/3009/">样例书</a><h1>第一章</h1><div id="booktxt"><p>他说：“你先回去，明天我们再谈。”</p><p>作者走进屋里，推荐了一本他珍藏多年的书，窗外雨声渐渐停了。</p><script>bad()</script><div class="ads">广告</div></div><a id="next_url" href="/read/3009/2.html">下一章</a></body></html>';
  const c=parseWebChapter(html,"https://example.org/read/3009/1.html");assert.ok(c.text.includes("作者走进屋里"));assert.ok(c.text.includes("“你先回去"));assert.ok(!c.text.includes("bad()"));assert.equal(c.nextURL,"https://example.org/read/3009/2.html");
});
test("网页 URL 与内网限制",()=>{for(const address of ["127.0.0.1","192.168.1.1","10.0.0.2","169.254.169.254","::1","::ffff:127.0.0.1"])assert.equal(publicAddress(address),false,address);assert.equal(publicAddress("8.8.8.8"),true);assert.throws(()=>normalizeURL("file:///etc/passwd"));assert.throws(()=>normalizeURL("https://user:pass@example.org"));});
