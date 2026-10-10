import test,{after} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createProfile,getActiveProfileId,getProfileDataDir,setActiveProfile,deleteProfile } from "../../src/lib/profiles";
import { closeDb,getSqlite } from "../../src/lib/db";
import { getBook,getChapter,importChapters,savePosition,savePreferences,chapterSummaries,importLocalBook,importUploadedBook } from "../../src/lib/novel/repository";
import { importLegacy,previewLegacy } from "../../src/lib/novel/legacy-import";
import { exportBackup,importBackup,resetSeriesProgress,deleteSeries } from "../../src/lib/library";
import { assertSession,beginSession,beginExportSession,revokeNovelSessions,captureNovelWorkspace,invalidateNovelWorkspace } from "../../src/lib/novel/sessions";
import { tts,kokoroPaths,kokoroIdentity } from "../../src/lib/novel/tts-service";
import { installRuntime,installation } from "../../src/lib/novel/runtime-install";
import { getPerformance, savePerformance } from "../../src/lib/novel/performance-settings";
import { benchmarkPerformance } from "../../src/lib/novel/runtime-benchmark";
import { scanFolder } from "../../src/lib/scanner";
import { legacyChunkOffset } from "../../src/lib/novel/chunks";
import { nextChapter } from "../../src/lib/novel/web-import";
import {startAudioExport,audioExportStatus,audioExportFile,cancelAudioExport} from "../../src/lib/novel/audio-export";
import {pcmWave} from "../../src/lib/novel/wav-export";
import JSZip from "jszip";
import {exportNovelArchive,restoreNovelArchive} from "../../src/lib/novel/archive";
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"rm-novel-tests-"));process.env.RESOURCES_MANAGER_DATA=path.join(temp,"data");
after(()=>{tts().stop();revokeNovelSessions();closeDb();fs.rmSync(temp,{recursive:true,force:true});});
test("资料增量迁移、续听、重置、旧新备份与索引删除",async()=>{
  const profile=getActiveProfileId();const a=importChapters(profile,"test:book","测试书",[{title:"一",text:'他说：“你先回去，明天我们再谈。”\n后面的文字。'}]);
  const b=importChapters(profile,"test:book","测试书",[{title:"一",text:'他说：“你先回去，明天我们再谈。”\n后面的文字。'}]);assert.equal(a.itemId,b.itemId);
  const book=await getBook(profile,a.itemId),ch=await getChapter(profile,a.itemId,book.chapters[0].id),c=ch.chunks[1];
  savePreferences(profile,a.itemId,{voiceId:58,rate:1.5,volume:.4});
  await savePosition(profile,a.itemId,{chapterId:ch.id,chunkId:c.id,offset:c.start,digest:c.digest,seconds:2.2,chunkVersion:1});
  const backup=exportBackup();assert.equal(backup.novelReadingState[0].seconds,2.2);
  assert.ok(backup.novelChapterProgress[0].progress>0);
  resetSeriesProgress([a.seriesId]);assert.equal((await getBook(profile,a.itemId)).position,null);assert.equal((await getBook(profile,a.itemId)).preferences.voiceId,58);
  assert.equal((await chapterSummaries(profile,a.itemId)).chapters[0].progress,0);
  importBackup(backup);assert.equal((await getBook(profile,a.itemId)).position?.seconds,2.2);
  const file=(getSqlite().prepare("SELECT path FROM media_items WHERE id=?").get(a.itemId) as {path:string}).path;assert.ok(fs.existsSync(file));
  deleteSeries(a.seriesId);assert.equal(getSqlite().prepare("SELECT * FROM novel_chapters").all().length,0);assert.ok(fs.existsSync(file));
  const old={...backup};delete (old as Partial<typeof old>).novelSources;delete (old as Partial<typeof old>).novelChapters;delete (old as Partial<typeof old>).novelReadingState;delete (old as Partial<typeof old>).novelChapterProgress;importBackup(old);assert.equal(getSqlite().prepare("SELECT * FROM novel_reading_state").all().length,0);
});
test("本地 TXT 导入去重、按章显示且原文件不变",async()=>{
  const p=getActiveProfileId(),file=path.join(temp,"local.txt"),original='第一章 归来\n他说：“回来了。”\n第二章 继续\n下一章的文字。';fs.writeFileSync(file,original);
  const first=importLocalBook(p,file),second=importLocalBook(p,file);assert.equal(first.itemId,second.itemId);
  const summary=await chapterSummaries(p,first.itemId);assert.equal(summary.chapters.length,2);assert.equal(summary.chapters[0].title,"第一章 归来");assert.equal(fs.readFileSync(file,"utf8"),original);
});
test("章节评论独立保存、重复导入更新，不改变正文和位置；两种备份保留评论",async()=>{
  const p=getActiveProfileId(),input={title:"第一章",text:"用于阅读和朗读的原创正文。",sourceURL:"https://comments.invalid/one",comments:["读者甲：测试评论。"]};
  const item=importChapters(p,"test:comments","评论测试",[input]),ch=await getChapter(p,item.itemId,item.chapterIds[0]),chunk=ch.chunks[0];
  assert.deepEqual(ch.comments,input.comments);assert.doesNotMatch(ch.text,/读者/);assert.doesNotMatch(ch.chunks.map(c=>c.speech).join(''),/读者/);
  const position={chapterId:ch.id,chunkId:chunk.id,offset:chunk.start,digest:chunk.digest,seconds:2,chunkVersion:1};
  await savePosition(p,item.itemId,position);
  const again=importChapters(p,"test:comments","评论测试",[{...input,comments:["第二次更新评论。"]}]);
  assert.equal(again.itemId,item.itemId);assert.deepEqual(again.chapterIds,item.chapterIds);
  assert.deepEqual((await getChapter(p,item.itemId,ch.id)).comments,["第二次更新评论。"]);
  assert.deepEqual((await getBook(p,item.itemId)).position,position);
  const file=(getSqlite().prepare("SELECT path FROM media_items WHERE id=?").get(item.itemId) as {path:string}).path;
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/评论/);
  const archive=exportNovelArchive(p),backup=exportBackup();importBackup(backup);
  assert.deepEqual((await getChapter(p,item.itemId,ch.id)).comments,["第二次更新评论。"]);
  const other=createProfile("评论恢复");setActiveProfile(other.id);await restoreNovelArchive(other.id,archive);
  const restored=getSqlite().prepare("SELECT item_id FROM novel_sources WHERE source_key='test:comments'").get() as {item_id:string};
  const book=await getBook(other.id,restored.item_id);assert.deepEqual((await getChapter(other.id,restored.item_id,book.chapters[0].id)).comments,["第二次更新评论。"]);
  deleteSeries((getSqlite().prepare("SELECT series_id FROM media_items WHERE id=?").get(restored.item_id) as {series_id:string}).series_id);
  assert.equal((getSqlite().prepare("SELECT COUNT(*) AS n FROM novel_chapter_comments").get() as {n:number}).n,0);
  setActiveProfile(p);
  assert.throws(()=>importChapters(p,"test:invalid-comments","无效",[{...input,comments:[123] as unknown as string[]}]),/评论无效/);
});
test("浏览器文件导入保留原文、按内容去重并限制格式",async()=>{
  const p=getActiveProfileId(),data=Buffer.from("第一章 上传\n上传原文。\n第二章 继续\n仍是原文。");
  const first=importUploadedBook(p,"上传.txt",data),again=importUploadedBook(p,"另一个名字.txt",data);
  assert.equal(first.itemId,again.itemId);assert.equal(first.title,"上传");
  assert.equal((await chapterSummaries(p,first.itemId)).chapters.length,2);
  const item=getSqlite().prepare("SELECT path FROM media_items WHERE id=?").get(first.itemId) as {path:string};
  assert.ok(item.path.startsWith(fs.realpathSync(getProfileDataDir(p))));assert.deepEqual(fs.readFileSync(item.path),data);
  assert.throws(()=>importUploadedBook(p,"file.exe",data));
  assert.throws(()=>importUploadedBook("missing","book.txt",data));
});
test("旧听页书库复制两次无重复且按原文迁移位置",async()=>{
  const profile=getActiveProfileId(),dir=path.join(temp,"Books");fs.mkdirSync(path.join(dir,"legacy"),{recursive:true});
  const text='原文第一段。\n他说：“你先回去，明天我们再谈。”\n第三段。';fs.writeFileSync(path.join(dir,"legacy","one.txt"),text);
  fs.writeFileSync(path.join(dir,"catalog.json"),JSON.stringify({books:[{id:"legacy",title:"旧小说",chapters:[{id:"old-ch",title:"第一章",fileName:"one.txt"}],chapterIndex:0,chunkIndex:1}],kokoroSpeaker:59,speed:1.25,volume:.35}));
  const p=previewLegacy(profile,dir);assert.equal(p.totalChapters,1);assert.deepEqual(await importLegacy(profile,p.token),{created:1,reused:0});assert.deepEqual(await importLegacy(profile,p.token),{created:0,reused:1});
  assert.equal(fs.readFileSync(path.join(dir,"legacy","one.txt"),"utf8"),text);
  const row=getSqlite().prepare("SELECT item_id FROM novel_sources WHERE kind='tingye'").get() as {item_id:string};const book=await getBook(profile,row.item_id);assert.equal(book.preferences.voiceId,59);assert.equal(book.position?.offset,text.indexOf("他说"));
});
test("旧 Swift 分段通过 grapheme 原文锚点迁移，而非复用新索引",()=>{
  const line="  "+"a\u0301".repeat(240)+"后面的文字。  ";
  assert.equal(legacyChunkOffset(line,1),482);
  assert.equal(legacyChunkOffset("第一段。\n  第二段。  ",1),7);
});
test("追加下载章节重算进度，内部 TXT 重扫不重复入库",async()=>{
  const p=getActiveProfileId(),a=importChapters(p,"test:append","追加测试",[{title:"第一章",text:"原文第一段。"}]);
  const ch=await getChapter(p,a.itemId,a.chapterIds[0]),chunk=ch.chunks[0];
  await savePosition(p,a.itemId,{chapterId:ch.id,chunkId:chunk.id,offset:chunk.start,digest:chunk.digest,seconds:3,chunkVersion:1},"auto",true,()=>{},false,true);
  assert.equal((await chapterSummaries(p,a.itemId)).chapters[0].progress,1);
  const appended=importChapters(p,"test:append","追加测试",[{title:"第二章",text:"原文第二段。"}]);assert.equal(appended.itemId,a.itemId);
  assert.equal((getSqlite().prepare("SELECT progress FROM media_items WHERE id=?").get(a.itemId) as {progress:number}).progress,.5);
  assert.equal((await getBook(p,a.itemId)).position?.seconds,3);
  const file=(getSqlite().prepare("SELECT path FROM media_items WHERE id=?").get(a.itemId) as {path:string}).path;
  const scan=await scanFolder(path.dirname(file),"novel");assert.equal(scan.scanned,1);assert.equal(scan.added,0);assert.deepEqual(scan.errors,[]);
});
test("本地 TXT 增加前置章节后按摘要找回原文",async()=>{
  const p=getActiveProfileId(),file=path.join(temp,"changed.txt");fs.writeFileSync(file,"第一章 旧章\n保存位置的原文。");const item=importLocalBook(p,file),book=await getBook(p,item.itemId),ch=await getChapter(p,item.itemId,book.chapters[0].id),c=ch.chunks[1];
  await savePosition(p,item.itemId,{chapterId:ch.id,chunkId:c.id,offset:c.start,digest:c.digest,seconds:1,chunkVersion:1});
  fs.writeFileSync(file,"第一章 新章\n新增的内容。\n第二章 旧章\n保存位置的原文。");
  const changed=await getBook(p,item.itemId);assert.equal(changed.position?.chapterId,"txt-1");assert.equal(changed.position?.chunkVersion,0);assert.equal(changed.position?.seconds,0);
});
test("离线已下载章节直接续读；下一章回环停止",async()=>{
  const p=getActiveProfileId(),book=importChapters(p,"test:offline","离线测试",[{title:"一",text:"第一章正文。",sourceURL:"https://offline.invalid/one",nextURL:"https://offline.invalid/two"},{title:"二",text:"第二章正文。",sourceURL:"https://offline.invalid/two",nextURL:"https://offline.invalid/one"}]);
  const session=beginSession(p,book.itemId),next=await nextChapter(p,book.itemId,book.chapterIds[0],session.id);assert.equal(next?.id,book.chapterIds[1]);
  await assert.rejects(()=>nextChapter(p,book.itemId,book.chapterIds[1],session.id),/回到已读章节/);
});
test("切换工作区/删除后旧会话无法写入或复活目录",async()=>{
  const a=getActiveProfileId(),item=importChapters(a,"test:isolation","隔离",[{title:"一",text:"隔离正文。"}]);const s=beginSession(a,item.itemId),exported=beginExportSession(a,item.itemId),dir=getProfileDataDir(a);
  const guard=captureNovelWorkspace(a),b=createProfile("B");invalidateNovelWorkspace(a);setActiveProfile(b.id);assert.throws(()=>assertSession(a,item.itemId,s.id));assert.equal(getSqlite().prepare("SELECT * FROM novel_sources").all().length,0);
  setActiveProfile(a);assert.throws(guard);assert.throws(()=>assertSession(a,item.itemId,exported.id));setActiveProfile(b.id);
  closeDb(a);deleteProfile(a);assert.equal(fs.existsSync(dir),false);await assert.rejects(()=>getBook(a,item.itemId));assert.equal(fs.existsSync(dir),false);
});
test("离线声音包校验失败可重试，完整包独立安装",{timeout:180000},async()=>{
  const bundle=kokoroPaths().bundle;process.env.RM_KOKORO_INSTALL_ROOT=path.join(temp,"installed-runtime");
  const wait=async()=>{while(installation().running)await new Promise(r=>setTimeout(r,30));};
  installRuntime(temp);await wait();assert.ok(installation().error);assert.equal(fs.existsSync(path.join(temp,"installed-runtime","bundle",`${process.platform}-${process.arch}`,"manifest.json")),false);
  installRuntime(bundle);await wait();assert.equal(installation().error,"");assert.equal(installation().done,installation().total);
  assert.ok(kokoroPaths().python.startsWith(path.join(temp,"installed-runtime")));
});
test("真实 Kokoro 合成、缓存、音色、会话去重",{timeout:180000},async()=>{
  const profile=getActiveProfileId(),item=importChapters(profile,"test:audio","声音测试",[{title:"一",text:'他说：“你先回去，明天我们再谈。”'}]);const session=beginSession(profile,item.itemId);
  const request={profileId:profile,itemId:item.itemId,sessionId:session.id,text:'他说：“你先回去，明天我们再谈。”',voiceId:3,priority:"foreground" as const};
  const start=Date.now();const [one,two]=await Promise.all([tts().synthesize(request),tts().synthesize(request)]);assert.equal(one.path,two.path);assert.ok(one.duration>1);
  const firstWallMs=Date.now()-start;
  const wav=fs.readFileSync(one.path);assert.equal(wav.toString("ascii",0,4),"RIFF");assert.equal(wav.readUInt32LE(24),24000);
  const cached=await tts().synthesize(request);assert.equal(cached.cached,true);const male=await tts().synthesize({...request,voiceId:58});assert.notEqual(male.path,one.path);
  console.log(JSON.stringify({kokoroFirstWallMs:firstWallMs,firstDuration:one.duration,firstElapsed:one.elapsed,cached:cached.cached,maleElapsed:male.elapsed}));
});
test("真实语音按选择导出 WAV/ZIP，不抢播放会话或修改续听进度",{timeout:180000},async()=>{
  const p=getActiveProfileId(),item=importChapters(p,"test:export","语音导出",[{title:"第一章",text:"清晨，我们开始阅读。"},{title:"第二章",text:"第二章的故事继续。"}]);
  const chapter=await getChapter(p,item.itemId,item.chapterIds[0]),chunk=chapter.chunks[0];
  await savePosition(p,item.itemId,{chapterId:chapter.id,chunkId:chunk.id,offset:chunk.start,digest:chunk.digest,seconds:1.2,chunkVersion:1});
  const before=await getBook(p,item.itemId),play=beginSession(p,item.itemId);
  const wait=async(id:string)=>{let status=audioExportStatus(p,item.itemId,id);while(status.status==="running"){await new Promise(r=>setTimeout(r,30));status=audioExportStatus(p,item.itemId,id);}assert.equal(status.status,"done",status.error);return audioExportFile(p,item.itemId,id);};
  const one=await startAudioExport(p,item.itemId,[item.chapterIds[0]],3);assertSession(p,item.itemId,play.id);
  const single=await wait(one.id);assert.ok(single.filename.endsWith(".wav"));assert.ok(pcmWave(fs.readFileSync(single.file)).pcm.length>1000);
  const many=await startAudioExport(p,item.itemId,item.chapterIds,3),archive=await wait(many.id),zip=await JSZip.loadAsync(fs.readFileSync(archive.file));assert.equal(Object.keys(zip.files).length,2);
  for(const entry of Object.values(zip.files))assert.ok(pcmWave(await entry.async("nodebuffer")).pcm.length>1000);
  assert.deepEqual(await getBook(p,item.itemId),before);assertSession(p,item.itemId,play.id);
  await assert.rejects(()=>startAudioExport(p,item.itemId,["missing"],3),/已保存/);
  const cancelled=await startAudioExport(p,item.itemId,[item.chapterIds[1]],58);cancelAudioExport(p,item.itemId,cancelled.id);assert.equal(audioExportStatus(p,item.itemId,cancelled.id).status,"cancelled");
  assertSession(p,item.itemId,play.id);assert.deepEqual(await getBook(p,item.itemId),before);
  while(tts().isBusy())await new Promise(r=>setTimeout(r,30));
  fs.unlinkSync(single.file);assert.throws(()=>audioExportStatus(p,item.itemId,one.id),/文件不存在/);
});
test("2/4 线程真实测速不保存选择、不改变书籍进度或正式缓存",{timeout:180000},async()=>{
  const p=getActiveProfileId(),item=importChapters(p,"test:performance","性能测试",[{title:"一",text:"性能测试不会改变阅读位置。"}]);
  const before=await getBook(p,item.itemId),settings=getPerformance(),cache=path.join(getProfileDataDir(p),"novel-audio/kokoro");
  const files=fs.existsSync(cache)?fs.readdirSync(cache):[];
  const two=await benchmarkPerformance({mode:"balanced"}),four=await benchmarkPerformance({mode:"speed"});
  for(const result of [two,four]){assert.ok(result.duration>1);assert.ok(result.elapsed>0);assert.equal(result.rtf,result.elapsed/result.duration);assert.ok(result.loadSeconds>0);}
  assert.deepEqual(getPerformance(),settings);assert.deepEqual(await getBook(p,item.itemId),before);
  assert.deepEqual(fs.existsSync(cache)?fs.readdirSync(cache):[],files);
  console.log(JSON.stringify({performanceTwo:two,performanceFour:four}));
});
test("线程保存后下一段重启引擎，当前已缓存片段仍可重用",{timeout:100000},async()=>{
  const profile=getActiveProfileId(),item=importChapters(profile,"test:threads","线程测试",[{title:"一",text:"先读这一段。"}]),session=beginSession(profile,item.itemId);
  const request={profileId:profile,itemId:item.itemId,sessionId:session.id,text:"先读这一段。",voiceId:3,priority:"foreground" as const};
  const first=await tts().synthesize(request),pid=tts().child?.pid;
  const active=tts().synthesize({...request,text:"这一段仍在生成，保存设置不应该中断它。"});
  savePerformance({mode:"low"});assert.equal(tts().child?.pid,pid);await active;assert.equal(tts().child?.pid,pid);
  const cached=await tts().synthesize(request);assert.equal(cached.cached,true);assert.equal(tts().child?.pid,pid);
  await tts().synthesize({...request,text:"设置保存后，下一段使用新的线程数量。"}); assert.notEqual(tts().child?.pid,pid);assert.ok(tts().configuration.endsWith(":1"));
  savePerformance({mode:"balanced"});assert.ok(fs.existsSync(first.path));
});
test("无效模型和符号链接导入失败不会覆盖现有声音包",{timeout:100000},async()=>{
  const original=kokoroIdentity(),invalid=path.join(temp,"invalid-model");fs.mkdirSync(invalid);fs.writeFileSync(path.join(invalid,"model.onnx"),"not onnx");
  const wait=async()=>{while(installation().running)await new Promise(r=>setTimeout(r,30));};
  installRuntime(invalid);await wait();assert.ok(installation().error);assert.equal(kokoroIdentity(),original);
  const linked=path.join(temp,"linked-model");fs.cpSync(kokoroPaths().model,linked,{recursive:true});fs.rmSync(path.join(linked,"voices.bin"));fs.symlinkSync(path.join(kokoroPaths().model,"voices.bin"),path.join(linked,"voices.bin"));
  installRuntime(linked);await wait();assert.match(installation().error,/符号链接/);assert.equal(kokoroIdentity(),original);
  assert.equal(fs.existsSync(kokoroPaths().bundle+".partial"),false);
});
test("官方完整版模型导入及独立缓存",{timeout:240000,skip:!process.env.RM_TEST_KOKORO_FULL},async()=>{
  const previous=kokoroIdentity(),wait=async()=>{while(installation().running)await new Promise(r=>setTimeout(r,30));};
  installRuntime(process.env.RM_TEST_KOKORO_FULL);await wait();assert.equal(installation().error,"");assert.notEqual(kokoroIdentity(),previous);assert.ok(fs.existsSync(path.join(kokoroPaths().model,"model.onnx")));
  const profile=getActiveProfileId(),item=importChapters(profile,"test:full-audio","完整版测试",[{title:"一",text:"完整版的中文朗读。"}]),session=beginSession(profile,item.itemId);
  const result=await tts().synthesize({profileId:profile,itemId:item.itemId,sessionId:session.id,text:"完整版的中文朗读。",voiceId:22,priority:"foreground"});assert.ok(result.duration>1);assert.equal(result.cached,false);
  console.log(JSON.stringify({fullModelDuration:result.duration,fullModelElapsed:result.elapsed}));
});
test("Node 父进程异常结束后 Python 不遗留",{timeout:100000},async()=>{
  const paths=kokoroPaths(),cache=path.join(temp,"parent-death-cache");fs.mkdirSync(cache);
  const source=`const {spawn}=require('node:child_process');const {createInterface}=require('node:readline');const child=spawn(${JSON.stringify(paths.python)},['-u',${JSON.stringify(paths.worker)},'--model',${JSON.stringify(paths.model)},'--cache',${JSON.stringify(cache)}],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONUTF8:'1'}});createInterface({input:child.stdout}).on('line',line=>{if(JSON.parse(line).ready)console.log(JSON.stringify({pid:child.pid}));});child.stderr.resume();`;
  const parent=spawn(process.execPath,['-e',source],{stdio:['ignore','pipe','pipe']});let python=0;
  try{
    python=await new Promise<number>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Worker startup timeout')),90000);let out='';parent.stdout.on('data',data=>{out+=data;const line=out.split('\n')[0];try{const ready=JSON.parse(line);clearTimeout(timer);resolve(ready.pid);}catch{/* Partial protocol line. */}});parent.once('error',e=>{clearTimeout(timer);reject(e);});});
    parent.kill('SIGKILL');let alive=true;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,100));try{process.kill(python,0);}catch{alive=false;break;}}
    assert.equal(alive,false);
  }finally{parent.kill('SIGKILL');if(python)try{process.kill(python,'SIGKILL');}catch{/* Already exited. */}}
});
