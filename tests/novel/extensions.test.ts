import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getActiveProfileId, createProfile, setActiveProfile } from "../../src/lib/profiles";
import { validateWebExtension, webExtension, installWebExtension, removeWebExtension, assertWebOrigin } from "../../src/lib/novel/web-extensions";
import { fetchChapter, downloadPage } from "../../src/lib/novel/web-import";
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"rm-extension-test-"));process.env.RESOURCES_MANAGER_DATA=temp;
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
const value={format:"resources-manager.web-novel.v1",id:"original",name:"原创站点",version:"1.0.0",license:"MIT",authorization:{basis:"own-content",statement:"该站点仅包含作者原创的测试故事，作者同意导入和朗读。",reference:"https://example.org/rights"},origins:["https://example.org"],selectors:{content:"article",title:"h1",bookTitle:"header .book-title",next:"a[rel=next]"}};
test("默认禁止网页抓取，无扩展时在联网前拒绝",()=>{
  const p=getActiveProfileId();assert.equal(webExtension(p),null);assert.throws(()=>fetchChapter(p,"https://example.org/1"),/先自行安装/);
});
test("扩展只能是声明式 JSON，必须确认安装",()=>{
  const p=getActiveProfileId();assert.throws(()=>installWebExtension(p,value,false),/确认/);
  for(const bad of [{...value,script:"run()"},{...value,origins:["http://example.org"]},{...value,origins:["https://example.org/path"]},{...value,authorization:null},{...value,selectors:{...value.selectors,content:"["}}])assert.throws(()=>validateWebExtension(bad));
  assert.equal(installWebExtension(p,value,true).id,"original");
});
test("扩展隔离、重启读取、卸载和来源限制",async()=>{
  const p=getActiveProfileId(),ext=webExtension(p)!;assert.equal(ext.name,value.name);
  assert.throws(()=>assertWebOrigin(ext,"https://example.org.evil.test/1"),/未授权/);
  assert.throws(()=>assertWebOrigin(ext,"https://user:pass@example.org/1"),/未授权/);
  await assert.rejects(()=>downloadPage("https://other.example/1",ext),/未授权/);
  const b=createProfile("扩展隔离");setActiveProfile(b.id);assert.equal(webExtension(b.id),null);setActiveProfile(p);
  removeWebExtension(p);assert.equal(webExtension(p),null);assert.throws(()=>fetchChapter(p,"https://example.org/1"),/先自行安装/);
});
