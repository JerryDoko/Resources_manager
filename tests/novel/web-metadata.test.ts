import test,{after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {validateWebExtension} from "../../src/lib/novel/web-extensions";
import {parseWebChapter} from "../../src/lib/novel/web-import";
import {assertCoverURL,expandWebTemplate,parseWebMetadata,saveWebMetadata} from "../../src/lib/novel/web-metadata";
import {importChapters,getBook,getChapter,savePosition,savePreferences} from "../../src/lib/novel/repository";
import {getActiveProfileId,createProfile,setActiveProfile} from "../../src/lib/profiles";
import {getSqlite,closeDb} from "../../src/lib/db";
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"rm-web-metadata-"));process.env.RESOURCES_MANAGER_DATA=path.join(temp,"data");
after(()=>{closeDb();fs.rmSync(temp,{recursive:true,force:true});});
const adapterFile=path.join(process.env.RM_TEST_ADAPTER_DIR||"../novel-web-extensions/adapters","esjzone","manifest.json");
const extension=validateWebExtension(fs.existsSync(adapterFile)?JSON.parse(fs.readFileSync(adapterFile,"utf8")):{
  format:"resources-manager.web-novel.v1",id:"metadata-test",name:"原创元数据结构测试",version:"1.0.0",license:"MIT",
  authorization:{basis:"unverified",statement:"此扩展仅用于原创的合成结构测试，不下载网站作品或读取账号信息。",reference:"https://example.org/rights"},
  origins:["https://www.esjzone.cc"],transport:"browser",
  selectors:{content:".forum-content",title:"h2",bookTitle:"a[href$='/{1}/']"},
  metadata:{tags:"a[href^='/tags/']",coverOrigins:["https://images.novelpia.com"],details:{request:"/detail/{1}.html",bookTitle:".book-detail h2",tags:"a[href^='/tags/']",cover:"img[src*='/imagebox/cover/']"}},
});
const source="https://www.esjzone.cc/forum/1784713189/595567.html";
const title="赚米玩家也太漂亮了", tags=["现代奇幻","日常","喜剧","游戏","TS","网络直播"];
const coverURL="https://images.novelpia.com/imagebox/cover/f2a597ae33a03d35086ffb3fdaaa575b_266094_ori.file";
test("ESJ 按章节书籍编号匹配目录名称，标签不混进正文",()=>{
  const html=`<a href="/forum/1584622251/">分类不是书名</a><a href="/forum/1584622251/1784713189/">${title}</a><h2>测试章</h2><div class="forum-content">${"仅用于结构验证的原创正文，不下载网站作品。".repeat(3)}</div>${tags.map(tag=>`<a href="/tags/${encodeURIComponent(tag)}/">${tag}</a>`).join("")}`;
  const result=parseWebChapter(html,source,extension);
  assert.equal(result.bookTitle,title);assert.deepEqual(result.tags,tags);assert.doesNotMatch(result.text,/现代奇幻|网络直播/);
  assert.equal(result.sourceKey,"https://www.esjzone.cc/forum/1784713189/");
  assert.equal(expandWebTemplate("/detail/{1}.html",source),"/detail/1784713189.html");
});
test("详情页读取封面 .file 链接，只允许声明的 HTTPS 图片来源",()=>{
  const html=`<div class="book-detail"><h2>${title}</h2><img src="${coverURL}"/></div>${tags.map(tag=>`<a href="/tags/${tag}/">${tag}</a>`).join("")}`;
  const result=parseWebMetadata(html,"https://www.esjzone.cc/detail/1784713189.html",extension,true,source);
  assert.deepEqual(result,{bookTitle:title,tags,coverURL});
  assert.throws(()=>assertCoverURL("https://evil.example/cover.jpg",extension),/允许范围/);
  assert.throws(()=>assertCoverURL("https://user:password@images.novelpia.com/cover",extension));
  assert.throws(()=>assertCoverURL("http://images.novelpia.com/cover",extension));
  assert.throws(()=>expandWebTemplate("/detail/{1}.html","https://www.esjzone.cc/forum/%27bad/1"));
  assert.equal(parseWebMetadata(html.replace(coverURL,"https://evil.example/cover.jpg"),source,extension,true).coverURL,undefined);
});
test("书名、标签、封面入库不改正文或进度，保留自定义标签和封面，按工作区隔离",async()=>{
  const profile=getActiveProfileId(),book=importChapters(profile,"metadata:test","网页小说（1784713189）",[{title:"一",text:"原创的测试正文。"}]);
  const chapter=await getChapter(profile,book.itemId,book.chapterIds[0]),chunk=chapter.chunks[0];
  const position={chapterId:chapter.id,chunkId:chunk.id,offset:chunk.start,digest:chunk.digest,seconds:2,chunkVersion:1};
  await savePosition(profile,book.itemId,position);savePreferences(profile,book.itemId,{voiceId:58});
  const image=await sharp({create:{width:20,height:30,channels:3,background:"#137b74"}}).png().toBuffer();
  await saveWebMetadata(profile,book.itemId,{bookTitle:title,tags,coverURL},image);
  const loaded=await getBook(profile,book.itemId);assert.equal(loaded.title,title);assert.deepEqual(loaded.position,position);assert.equal(loaded.preferences.voiceId,58);
  const item=getSqlite().prepare("SELECT * FROM media_items WHERE id=?").get(book.itemId) as {thumbnail_path:string;path:string};
  assert.ok(fs.existsSync(item.thumbnail_path));assert.equal((await sharp(item.thumbnail_path).metadata()).format,"webp");assert.equal(loaded.storagePath,item.path);
  await saveWebMetadata(profile,book.itemId,{bookTitle:title,tags:["新标签",tags[0]]});
  assert.equal((getSqlite().prepare("SELECT COUNT(*) n FROM series_tags WHERE series_id=?").get(book.seriesId) as {n:number}).n,7);
  getSqlite().prepare("UPDATE media_items SET title='自定书名',thumbnail_path='/custom/cover.webp' WHERE id=?").run(book.itemId);
  getSqlite().prepare("UPDATE series SET title='自定书名',thumbnail_path='/custom/series.webp' WHERE id=?").run(book.seriesId);
  await saveWebMetadata(profile,book.itemId,{bookTitle:title,coverURL},image);
  assert.equal((await getBook(profile,book.itemId)).title,"自定书名");
  assert.equal((getSqlite().prepare("SELECT thumbnail_path FROM media_items WHERE id=?").get(book.itemId) as {thumbnail_path:string}).thumbnail_path,"/custom/cover.webp");
  const other=createProfile("隔离");setActiveProfile(other.id);
  await assert.rejects(()=>saveWebMetadata(profile,book.itemId,{bookTitle:title}),/工作区|配置/);
  assert.equal((getSqlite().prepare("SELECT COUNT(*) n FROM tags").get() as {n:number}).n,0);
  setActiveProfile(profile);
  assert.equal((await getChapter(profile,book.itemId,chapter.id)).text,chapter.text);
});
