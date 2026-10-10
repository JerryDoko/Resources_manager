import test from "node:test";
import assert from "node:assert/strict";
import { NovelPlayback } from "../../src/lib/novel/playback-controller";
import { splitChapters } from "../../src/lib/novel/chunks";
import { DEFAULT_PREFERENCES, type Clip } from "../../src/lib/novel/types";
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
class FakeAudio {
  src="";volume=1;playbackRate=1;preservesPitch=true;currentTime=0;duration=10;paused=true;
  onended:(()=>void)|null=null;ontimeupdate:(()=>void)|null=null;onerror:(()=>void)|null=null;onloadedmetadata:(()=>void)|null=null;
  async play(){this.paused=false;this.onloadedmetadata?.();}
  pause(){this.paused=true;}load(){}removeAttribute(){}
}
function setup(){
  const chapters=splitChapters("第一章 开始\n第一段。\n第二段。\n第三段。\n第二章 后续\n下一章正文。");
  const requests:{action:string;payload:Record<string,unknown>}[]=[],audios:FakeAudio[]=[];
  const pending=deferred<Clip>();let delay=false;
  const request=async<T>(action:string,payload:Record<string,unknown>={})=>{
    requests.push({action,payload});let result:unknown={ok:true};
    if(action==="book")result={itemId:"item",profileId:"p",title:"测试",format:"txt",chapters:chapters.map(c=>({id:c.id,title:c.title})),preferences:{...DEFAULT_PREFERENCES},position:null};
    if(action==="chapter")result=chapters.find(c=>c.id===payload.chapterId);
    if(action==="begin")result={id:String(requests.length)};
    if(action==="next")result=chapters[chapters.findIndex(c=>c.id===payload.chapterId)+1]||null;
    if(action==="synthesize"||action==="preview")result=delay?await pending.promise:{url:String(payload.chunkId||"preview"),cached:false,duration:10,elapsed:.3};
    return result as T;
  };
  const p=new NovelPlayback("p","item",()=>{const a=new FakeAudio();audios.push(a);return a as unknown as HTMLAudioElement;},request);
  return {p,audios,requests,pending,delay:()=>{delay=true;}};
}
test("首段播放先于后两段预取；重复 ended 仅推进一次",async()=>{
  const {p,audios,requests}=setup();try{await p.load();await p.play();assert.equal(audios.length,1);assert.equal(audios[0].paused,false);await tick();assert.equal(p.state.buffered,2);const ended=audios[0].onended!;ended();ended();await tick();assert.equal(p.state.index,1);assert.equal(audios.length,2);assert.equal(requests.filter(r=>r.action==="synthesize"&&r.payload.priority==="foreground").length,1);}finally{p.close();}
});
test("迟到合成在暂停后不能发声",async()=>{const {p,audios,delay,pending}=setup();try{await p.load();delay();const playing=p.play();await tick();await p.pause();pending.resolve({url:"late",cached:false,duration:10,elapsed:1});await playing;assert.equal(audios.length,0);assert.equal(p.state.playing,false);}finally{p.close();}});
test("失效音频链接清除缓存，重试重新申请前台音频",async()=>{
  const {p,audios,requests}=setup();try{await p.load();await p.play();audios[0].onerror!();await tick();assert.equal(p.state.playing,false);await p.play();assert.equal(audios.at(-1)!.paused,false);assert.equal(requests.filter(r=>r.action==="synthesize"&&r.payload.priority==="foreground").length,2);}finally{p.close();}
});
test("实时音量倍速与试听不能改变正文位置",async()=>{const {p,audios,requests}=setup();try{await p.load();await p.play();audios[0].currentTime=3.2;await p.update({volume:.4,rate:1.5});assert.equal(audios[0].volume,.4);assert.equal(audios[0].playbackRate,1.5);await p.preview();const preview=audios.at(-1)!;preview.currentTime=8;await p.pause();assert.equal(p.state.seconds,3.2);assert.equal((requests.filter(r=>r.action==="progress").at(-1)!.payload.position as {seconds:number}).seconds,3.2);}finally{p.close();}});
test("慢下一章不阻塞当前章；预取不切正文",async()=>{const {p,audios}=setup();try{await p.load();await p.seek(p.state.chapter!.id,2,false);const original=p.request;const next=deferred<null>();p.request=(action,payload)=>action==="next"?next.promise as never:original(action,payload);await p.play();assert.equal(audios.length,1);await tick();assert.equal(p.state.chapter?.id,"txt-0");assert.equal(p.state.index,2);await p.pause();next.resolve(null);}finally{p.close();}});
test("整章装饰自动跳过并在最后一章结束，ended 不重复推进",async()=>{
  const {p,audios,requests}=setup();const original=p.request;const chapters=splitChapters("***\n第二章 结束\n最后一段。");
  p.request=async(action,payload={})=>{
    if(action==="chapter")return chapters.find(c=>c.id===payload.chapterId) as never;
    if(action==="next")return (chapters[chapters.findIndex(c=>c.id===payload.chapterId)+1]||null) as never;
    return original(action,payload);
  };
  try{await p.load();await p.play();assert.equal(p.state.chapter?.id,"txt-1");assert.equal(audios.length,1);await tick();
    const first=audios[0].onended!;first();first();await tick();assert.equal(p.state.index,1);
    audios.at(-1)!.onended!();await tick();await tick();assert.equal(p.state.playing,false);assert.equal(p.state.status,"已读完");assert.ok(requests.some(r=>r.action==="progress"&&r.payload.completed));
  }finally{p.close();}
});
test("显式章节优先于旧续听位置，直接从新章开头读取",async()=>{
  const {p,requests}=setup(),original=p.request;
  p.request=async<T>(action:string,payload?:Record<string,unknown>)=>{const result=await original<T>(action,payload);if(action==="book")return {...result as object,position:{chapterId:"txt-0",chunkId:"old",digest:"old",seconds:8}} as T;return result;};
  try{await p.load("auto","txt-1");assert.equal(p.state.chapter?.id,"txt-1");assert.equal(p.state.index,0);assert.equal(p.state.seconds,0);assert.ok(p.state.locationVersion>0);assert.equal((requests.find(r=>r.action==="reading-progress")!.payload.position as {chapterId:string}).chapterId,"txt-1");}finally{p.close();}
});
test("普通阅读保存原文锚点且不抢占朗读会话，切章请求重新定位",async()=>{
  const {p,requests}=setup();try{await p.load();const version=p.state.locationVersion;p.readAt(2);await p.positionWrites;assert.equal(p.state.index,2);assert.equal(p.state.locationVersion,version);assert.equal(requests.filter(r=>r.action==="begin").length,0);assert.equal((requests.find(r=>r.action==="reading-progress")!.payload.position as {seconds:number}).seconds,0);await p.seek("txt-1",0,false);assert.equal(p.state.locationVersion,version+1);assert.equal((requests.filter(r=>r.action==="reading-progress").at(-1)!.payload.position as {chapterId:string}).chapterId,"txt-1");}finally{p.close();}
});
test("慢进度请求按序完成后才保存新章节，不能反写旧位置",async()=>{
  const {p}=setup(),original=p.request,blocked=deferred<void>(),writes:string[]=[];
  p.request=async(action,payload={})=>{if(action==="reading-progress"){const position=payload.position as {chapterId:string};if(!writes.length)await blocked.promise;writes.push(position.chapterId);}return original(action,payload);};
  try{await p.load();p.readAt(1);const seek=p.seek("txt-1",0,false);await tick();assert.deepEqual(writes,[]);blocked.resolve();await seek;assert.deepEqual(writes,["txt-0","txt-1"]);}finally{p.close();}
});
test("手动切章立即显示加载状态，重复点击不重复读取",async()=>{
  const {p,requests}=setup(),original=p.request,blocked=deferred<void>();
  try{
    await p.load();
    p.request=async(action,payload)=>{if(action==="chapter")await blocked.promise;return original(action,payload);};
    const task=p.changeChapter(1);
    assert.equal(p.state.chapterLoading,"next");
    await p.changeChapter(1);await p.changeChapter(-1);await tick();
    assert.equal(p.state.chapter?.id,"txt-0");
    blocked.resolve();await task;
    assert.equal(p.state.chapterLoading,null);assert.equal(p.state.chapter?.id,"txt-1");
    assert.equal(requests.filter(r=>r.action==="chapter").length,2);
    await p.changeChapter(-1);assert.equal(p.state.chapter?.id,"txt-0");
    await p.changeChapter(-1);assert.equal(p.state.notice,"已经是第一章");
  }finally{blocked.resolve();p.close();}
});
test("下载下一章期间保持加载提示，成功后更新目录且保留上一章",async()=>{
  const {p}=setup(),original=p.request,blocked=deferred<void>();let nextRequests=0;
  try{
    await p.load();p.set({book:{...p.state.book!,chapters:p.state.book!.chapters.slice(0,1)}});
    p.request=async(action,payload)=>{if(action==="next"){nextRequests++;await blocked.promise;}return original(action,payload);};
    const task=p.changeChapter(1);await tick();
    assert.equal(p.state.chapterLoading,"next");await p.changeChapter(1);assert.equal(nextRequests,1);
    blocked.resolve();await task;
    assert.equal(p.state.chapterLoading,null);assert.equal(p.state.chapter?.id,"txt-1");assert.equal(p.state.book?.chapters.length,2);
    await p.changeChapter(-1);assert.equal(p.state.chapter?.id,"txt-0");
    await p.changeChapter(1);await p.changeChapter(1);
    assert.equal(p.state.chapterLoading,null);assert.equal(p.state.notice,"没有可加载的下一章");assert.equal(p.session,"");
  }finally{blocked.resolve();p.close();}
});
test("下一章失败解除加载锁并可重试",async()=>{
  const {p}=setup(),original=p.request;
  try{
    await p.load();p.set({book:{...p.state.book!,chapters:p.state.book!.chapters.slice(0,1)}});
    p.request=async(action,payload)=>{if(action==="next")throw new Error("测试网络失败");return original(action,payload);};
    await p.changeChapter(1);
    assert.equal(p.state.chapterLoading,null);assert.equal(p.state.error,"测试网络失败");assert.equal(p.state.chapter?.id,"txt-0");
    p.request=original;await p.changeChapter(1);assert.equal(p.state.error,"");assert.equal(p.state.chapter?.id,"txt-1");
  }finally{p.close();}
});
test("关闭阅读器后迟到的下一章不能更新正文",async()=>{
  const {p}=setup(),original=p.request,blocked=deferred<void>();
  try{
    await p.load();p.set({book:{...p.state.book!,chapters:p.state.book!.chapters.slice(0,1)}});
    p.request=async(action,payload)=>{if(action==="next")await blocked.promise;return original(action,payload);};
    const task=p.changeChapter(1);await tick();p.close();blocked.resolve();await task;
    assert.equal(p.state.chapterLoading,null);assert.equal(p.state.chapter?.id,"txt-0");assert.equal(p.state.book?.chapters.length,1);
  }finally{blocked.resolve();p.close();}
});
test("听书切章继续播放，末章提示不会中断当前朗读",async()=>{
  const {p,audios}=setup();
  try{
    await p.load();await p.play();await p.changeChapter(1);
    assert.equal(p.state.chapter?.id,"txt-1");assert.equal(p.state.playing,true);assert.equal(p.state.chapterLoading,null);
    audios.at(-1)!.currentTime=2;
    await p.changeChapter(1);
    assert.equal(p.state.notice,"没有可加载的下一章");assert.equal(p.state.playing,true);assert.equal(audios.at(-1)!.currentTime,2);
  }finally{p.close();}
});
