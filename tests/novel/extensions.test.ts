import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getActiveProfileId, getProfileDataDir, createProfile, setActiveProfile } from "../../src/lib/profiles";
import { validateWebExtension, webExtension, webExtensions, webExtensionForURL, setWebExtensionEnabled, installWebExtension, removeWebExtension, assertWebOrigin } from "../../src/lib/novel/web-extensions";
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
test("未知来源可以如实声明并安装，但仍需确认且不能扩大访问范围",()=>{
  const p=getActiveProfileId(),unknown={...value,authorization:{basis:"unverified",statement:"此适配仅声明公开页面的结构规则，站点与内容来源授权尚未核实。",reference:"https://example.org/chapter"}};
  assert.throws(()=>installWebExtension(p,unknown,false),/确认/);
  const extension=installWebExtension(p,unknown,true);
  assert.equal(extension.authorization.basis,"unverified");assert.equal(webExtension(p)?.authorization.basis,"unverified");
  assert.throws(()=>assertWebOrigin(extension,"https://different.example/chapter"),/未授权/);
  removeWebExtension(p);assert.equal(webExtension(p),null);
});
test("多个扩展共存，按链接选择网站，停用和更新状态持久保存",()=>{
  const p=getActiveProfileId(), second={...value,id:"second",name:"第二网站",origins:["https://second.example"]};
  installWebExtension(p,value,true);installWebExtension(p,second,true);
  assert.equal(webExtensions(p).length,2);
  assert.equal(webExtensionForURL(p,"https://example.org/chapter").id,value.id);
  assert.equal(webExtensionForURL(p,"https://second.example/chapter").id,second.id);
  assert.throws(()=>webExtensionForURL(p,"https://second.example.evil.test/chapter"),/尚未安装/);
  assert.throws(()=>webExtensionForURL(p,"http://second.example/chapter"),/HTTPS/);
  setWebExtensionEnabled(p,second.id,false);
  assert.throws(()=>fetchChapter(p,"https://second.example/chapter"),/已停用/);
  installWebExtension(p,{...second,version:"2.0.0"},true);
  assert.equal(webExtensions(p).find(e=>e.extension.id===second.id)?.enabled,false);
  assert.equal(webExtensions(p).find(e=>e.extension.id===value.id)?.enabled,true);
  const registry=path.join(getProfileDataDir(p),"web-novel-extensions.json");
  const before=fs.readFileSync(registry,"utf8"),stamp=fs.statSync(registry).mtimeMs;
  webExtensions(p);setWebExtensionEnabled(p,value.id,true);
  assert.equal(fs.readFileSync(registry,"utf8"),before);assert.equal(fs.statSync(registry).mtimeMs,stamp);
  assert.throws(()=>removeWebExtension(p),/指定/);
  removeWebExtension(p,second.id);assert.deepEqual(webExtensions(p).map(e=>e.extension.id),[value.id]);
  removeWebExtension(p,value.id);assert.equal(webExtensions(p).length,0);
});
test("旧单扩展无写入迁移；删除最后一个后不会从旧文件复活",()=>{
  const original=getActiveProfileId(),p=createProfile("旧扩展迁移").id;setActiveProfile(p);
  const dir=getProfileDataDir(p);fs.mkdirSync(dir,{recursive:true});
  const legacy=path.join(dir,"web-novel-extension.json"),registry=path.join(dir,"web-novel-extensions.json");
  fs.writeFileSync(legacy,JSON.stringify(value));const before=fs.readFileSync(legacy,"utf8");
  assert.equal(webExtensions(p).length,1);assert.equal(fs.existsSync(registry),false);
  installWebExtension(p,{...value,id:"extra",origins:["https://extra.example"]},true);
  assert.equal(webExtensions(p).length,2);assert.equal(fs.readFileSync(legacy,"utf8"),before);
  removeWebExtension(p,"extra");removeWebExtension(p,value.id);
  assert.equal(webExtensions(p).length,0);assert.equal(fs.readFileSync(legacy,"utf8"),before);
  setActiveProfile(original);
});
test("重叠网站不暗自挑选扩展，取消勾选后消除冲突；配置互相隔离",()=>{
  const p=getActiveProfileId();installWebExtension(p,value,true);installWebExtension(p,{...value,id:"alternate"},true);
  assert.throws(()=>webExtensionForURL(p,"https://example.org/chapter"),/多个扩展/);
  setWebExtensionEnabled(p,"alternate",false);assert.equal(webExtensionForURL(p,"https://example.org/chapter").id,value.id);
  const other=createProfile("多站点隔离");assert.deepEqual(webExtensions(other.id),[]);
  assert.throws(()=>setWebExtensionEnabled(p,"missing",true),/不存在/);
  assert.throws(()=>setWebExtensionEnabled(p,value.id,"false"),/有效的启用状态/);
  removeWebExtension(p,"alternate");removeWebExtension(p,value.id);
});
