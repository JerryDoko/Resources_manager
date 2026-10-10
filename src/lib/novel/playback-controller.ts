import { novelRequest } from "./client";
import { type Chapter, type Clip, type NovelBook, type NovelPreferences, type Position } from "./types";
export interface PlaybackState { book: NovelBook | null; chapter: Chapter | null; index: number; seconds: number; playing: boolean; status: string; error: string; notice: string; buffered: number; nextReady: string; underruns: number; elapsed: number; preview: boolean; locationVersion: number; chapterLoading: "previous" | "next" | null }
type Request = <T>(action: string, payload?: Record<string, unknown>) => Promise<T>;
export class NovelPlayback {
  state: PlaybackState = { book:null,chapter:null,index:0,seconds:0,playing:false,status:"加载中",error:"",notice:"",buffered:0,nextReady:"",underruns:0,elapsed:0,preview:false,locationVersion:0,chapterLoading:null };
  navigationVersion=0;
  listeners = new Set<() => void>();
  generation=0; session=""; audio: HTMLAudioElement | null=null; utterance: SpeechSynthesisUtterance | null=null;
  clipCache=new Map<string,Clip>(); nextCache=new Map<string,Promise<Chapter|null>>();
  encoding="auto"; closed=false; heartbeat: ReturnType<typeof setInterval>|null=null;
  channel: BroadcastChannel|null=null; lastSave=0; transition: Promise<void>=Promise.resolve();
  preferenceWrites: Promise<unknown>=Promise.resolve();
  positionWrites: Promise<unknown>=Promise.resolve();
  lastCompleted: Position|null=null;
  request: Request;
  constructor(readonly profileId:string,readonly itemId:string,readonly makeAudio=()=>new Audio(), request?: Request) {
    this.request=request || ((action,payload={})=>novelRequest(profileId,action,{itemId,encoding:this.encoding,...payload}));
  }
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
  snapshot=()=>this.state;
  set(patch:Partial<PlaybackState>){if(this.closed)return;this.state={...this.state,...patch};for(const fn of this.listeners)fn();}
  async load(encoding="auto",requestedChapter?:string) {
    this.closed=false;
    ++this.navigationVersion;this.set({chapterLoading:null});
    if(!this.channel && typeof BroadcastChannel!=="undefined") { this.channel=new BroadcastChannel("rm-novel-playback");this.channel.onmessage=e=>{if(e.data?.session && e.data.session!==this.session && (this.state.playing||this.state.preview))void this.pause("另一窗口已开始朗读");}; }
    await this.pause();await this.positionWrites.catch(()=>{});this.encoding=encoding;const token=++this.generation;
    try {
      const book=await this.request<NovelBook>("book");if(token!==this.generation||this.closed)return;
      const pos=requestedChapter?null:book.position, chapterId=requestedChapter||(book.chapters.some(c=>c.id===pos?.chapterId)?pos!.chapterId:book.chapters[0]?.id);
      if(!chapterId)throw new Error("此书没有章节");
      const chapter=await this.request<Chapter>("chapter",{chapterId});if(token!==this.generation||this.closed)return;
      let index=0, seconds=0, notice="";
      if(pos){
        const exact=chapter.chunks.findIndex(c=>c.id===pos.chunkId&&c.digest===pos.digest);
        if(exact>=0&&pos.chunkVersion===1){index=exact;seconds=pos.seconds;}
        else { const matches=chapter.chunks.map((c,i)=>({c,i})).filter(x=>x.c.digest===pos.digest).sort((a,b)=>Math.abs(a.c.start-pos.offset)-Math.abs(b.c.start-pos.offset)); index=matches[0]?.i??Math.max(0,chapter.chunks.findIndex(c=>c.end>pos.offset));notice="正文或编码已变化，已定位到附近原文，请确认续听位置"; }
      }
      this.set({book,chapter,index,seconds,status:"就绪",error:"",notice,locationVersion:this.state.locationVersion+1});
      if(requestedChapter)await this.saveReadingPosition(false);
    }catch(e){if(token===this.generation)this.fail(e);}
  }
  stopAudio(){if(this.audio){this.audio.onended=null;this.audio.ontimeupdate=null;this.audio.onerror=null;this.audio.pause();this.audio.removeAttribute("src");this.audio.load();this.audio=null;}if(this.utterance){this.utterance.onend=null;this.utterance=null;globalThis.speechSynthesis?.cancel();}}
  position():Position|null {const c=this.state.chapter,chunk=c?.chunks[this.state.index];return c&&chunk?{chapterId:c.id,chunkId:chunk.id,offset:chunk.start,digest:chunk.digest,seconds:!this.state.preview&&this.audio?this.audio.currentTime:this.state.seconds,chunkVersion:1}:null;}
  writePosition(action:string,payload:Record<string,unknown>){this.positionWrites=this.positionWrites.catch(()=>{}).then(()=>this.request(action,payload));return this.positionWrites.catch(e=>this.set({error:e instanceof Error?e.message:String(e)}));}
  async persist(session=this.session,position=this.position(),played=true){if(!session||!position)return;await this.writePosition("progress",{sessionId:session,position,played});}
  async saveReadingPosition(played=true){const position=this.position();if(position)await this.writePosition("reading-progress",{position,played});}
  readAt(index:number){if(this.state.chapterLoading||this.state.playing||this.state.preview||!this.state.chapter||index===this.state.index)return;this.set({index:Math.max(0,Math.min(index,this.state.chapter.chunks.length-1)),seconds:0});void this.saveReadingPosition();}
  async pause(status="已暂停") {
    const old=this.session, position=this.position(); ++this.generation;
    if(this.heartbeat)clearInterval(this.heartbeat);this.heartbeat=null;
    this.stopAudio();this.session="";this.nextCache.clear();
    this.set({playing:false,preview:false,seconds:position?.seconds||0,status,buffered:0,nextReady:""});
    const previous=this.transition;
    this.transition=(async()=>{await previous;if(old){await this.persist(old,position);await this.request("cancel",{sessionId:old}).catch(()=>{});}})();
    return this.transition;
  }
  async claim(){
    await this.transition;await this.positionWrites.catch(()=>{});
    const token=this.generation;
    const session=await this.request<{id:string}>("begin");
    if(token!==this.generation||this.closed){void this.request("cancel",{sessionId:session.id});return false;}
    this.session=session.id;this.channel?.postMessage({session:session.id});
    this.heartbeat=setInterval(()=>{const id=this.session;if(id)void this.request("heartbeat",{sessionId:id}).catch(()=>{if(this.session===id)void this.pause("朗读会话已结束");});},750);
    return true;
  }
  async play(){
    await this.pause(); if(this.closed||!this.state.chapter)return;
    const token=this.generation;
    try {if(!await this.claim())return;this.set({playing:true,error:""});await this.playCurrent(token,new Set());}catch(e){if(token===this.generation)this.fail(e);}
  }
  valid(token:number){return !this.closed&&token===this.generation&&!!this.session;}
  key(ch:Chapter,index:number){return `${ch.id}:${ch.chunks[index]?.digest}:${this.state.book?.preferences.voiceId}`;}
  async clip(ch:Chapter,index:number,priority:"foreground"|"prefetch",token:number) {
    const key=this.key(ch,index),hit=this.clipCache.get(key); if(hit)return hit;
    const result=await this.request<Clip>("synthesize",{sessionId:this.session,chapterId:ch.id,chunkId:ch.chunks[index].id,voiceId:this.state.book!.preferences.voiceId,priority});
    if(!this.valid(token))throw new Error("朗读会话已取消");this.clipCache.set(key,result);if(this.clipCache.size>256)this.clipCache.delete(this.clipCache.keys().next().value!);return result;
  }
  next(ch:Chapter){let task=this.nextCache.get(ch.id);if(!task){task=this.request<Chapter|null>("next",{chapterId:ch.id,sessionId:this.session});this.nextCache.set(ch.id,task);task.catch(()=>{if(this.nextCache.get(ch.id)===task)this.nextCache.delete(ch.id);});}return task;}
  async playCurrent(token:number,seen:Set<string>) {
    if(!this.valid(token)||!this.state.playing)return;
    let chapter=this.state.chapter!,index=this.state.index;
    while(!chapter.chunks[index]?.speech){
      if(index<chapter.chunks.length){index++;continue;}
      if(seen.has(chapter.id))throw new Error("下一章出现回环，已停止朗读");seen.add(chapter.id);
      const next=await this.next(chapter);if(!this.valid(token))return;
      if(!next){if(this.lastCompleted)await this.writePosition("progress",{sessionId:this.session,position:this.lastCompleted,completed:true});if(!this.valid(token))return;this.set({index:Math.max(0,chapter.chunks.length-1),seconds:this.lastCompleted?.seconds||0});await this.pause("已读完");return;}
      chapter=next;index=0;
    }
    const book=this.state.book!;
    this.set({chapter,index,book:book.chapters.some(c=>c.id===chapter.id)?book:{...book,chapters:[...book.chapters,{id:chapter.id,title:chapter.title}]}});
    const prefs=this.state.book!.preferences;
    if(prefs.engine==="system"){
      const voice=globalThis.speechSynthesis?.getVoices().find(v=>/^zh/i.test(v.lang));
      if(!voice)throw new Error("当前环境没有可用的系统中文语音，请使用 Kokoro");
      const u=new SpeechSynthesisUtterance(chapter.chunks[index].speech);this.utterance=u;u.voice=voice;u.rate=prefs.rate;u.volume=prefs.volume;
      let ended=false;u.onend=()=>{if(ended||!this.valid(token)||this.utterance!==u)return;ended=true;this.utterance=null;void this.advance(token);};u.onerror=()=>{if(this.valid(token))this.fail(new Error("系统语音播放失败"));};
      this.set({status:"系统语音 · 续听从本段开头开始",seconds:0});speechSynthesis.speak(u);void this.warm(token,chapter,index);return;
    }
    const ready=this.clipCache.has(this.key(chapter,index));
    this.set({status:ready?"播放缓存":"正在准备下一段",underruns:this.state.underruns+(ready?0:1)});
    const clip=await this.clip(chapter,index,"foreground",token);if(!this.valid(token))return;
    await this.playClip(clip,token,false);
    if(this.valid(token))void this.warm(token,chapter,index);
  }
  async playClip(clip:Clip,token:number,preview:boolean) {
    const audio=this.makeAudio();this.audio=audio;const prefs=this.state.book!.preferences;
    audio.src=clip.url;audio.volume=prefs.volume;audio.playbackRate=prefs.rate;audio.preservesPitch=true;
    const seconds=preview?0:this.state.seconds;
    audio.onloadedmetadata=()=>{if(this.audio===audio&&seconds>0)audio.currentTime=Math.min(seconds,Math.max(0,audio.duration-0.05));};
    let ended=false;
    audio.onended=()=>{if(ended||!this.valid(token)||this.audio!==audio)return;ended=true;
      if(!preview){this.lastCompleted={...this.position()!,seconds:audio.duration};void this.writePosition("progress",{sessionId:this.session,position:this.lastCompleted,chapterCompleted:this.state.index===this.state.chapter!.chunks.length-1});}
      this.audio=null;
      if(preview){this.set({preview:false,status:"试听完成"});void this.pause("试听完成");}
      else void this.advance(token);
    };
    audio.ontimeupdate=()=>{if(!this.valid(token)||preview||this.audio!==audio||audio.paused)return;this.set({seconds:audio.currentTime});if(Date.now()-this.lastSave>2000){this.lastSave=Date.now();void this.persist();}};
    audio.onerror=()=>{if(this.valid(token)){if(!preview&&this.state.chapter)this.clipCache.delete(this.key(this.state.chapter,this.state.index));this.fail(new Error("音频播放失败，请重试"));}};
    try{await audio.play();}catch(e){if(this.valid(token)){this.set({playing:false,status:"点击播放以继续",error:e instanceof Error?e.message:"播放许可被阻止"});}return;}
    if(!this.valid(token)){audio.pause();return;}
    this.set({status:preview?"音色试听":clip.cached?"正在播放缓存":"正在朗读",elapsed:clip.elapsed});
  }
  async advance(token:number){
    if(!this.valid(token)||!this.state.playing)return;
    this.set({index:this.state.index+1,seconds:0,buffered:0});
    try{await this.playCurrent(token,new Set());}catch(e){if(this.valid(token))this.fail(e);}
  }
  async warm(token:number,chapter:Chapter,index:number){
    const prefs=this.state.book!.preferences;
    const stillHere=()=>this.valid(token)&&this.state.chapter?.id===chapter.id&&this.state.index===index;
    const remaining=chapter.chunks.slice(index+1).filter(c=>c.speech).length;
    if(remaining<=2){this.set({nextReady:"正在准备下一章"});void this.next(chapter).then(async next=>{
      if(!this.valid(token)||!next)return;const first=next.chunks.findIndex(c=>c.speech);if(first>=0&&prefs.engine==="kokoro")await this.clip(next,first,"prefetch",token);
      if(stillHere())this.set({nextReady:"下一章开头已准备"});
    }).catch(()=>{if(stillHere())this.set({nextReady:"下一章准备失败，可重试"});});}
    try {
      let current=chapter,offset=index+1,count=0;const seen=new Set<string>();
      while(count<2&&this.valid(token)){
        if(offset>=current.chunks.length){if(seen.has(current.id))break;seen.add(current.id);const next=await this.next(current);if(!next||!this.valid(token))break;current=next;offset=0;continue;}
        if(current.chunks[offset].speech){if(prefs.engine==="kokoro")await this.clip(current,offset,"prefetch",token);count++;if(stillHere())this.set({buffered:count});}offset++;
      }
    }catch{if(stillHere())this.set({nextReady:"后续准备失败，播放时可重试"});}
  }
  async seek(chapterId:string,index=0,resume=this.state.playing){
    await this.pause();const token=this.generation;
    try{const chapter=await this.request<Chapter>("chapter",{chapterId});if(token!==this.generation||this.closed)return;this.set({chapter,index:Math.max(0,Math.min(index,chapter.chunks.length-1)),seconds:0,error:"",locationVersion:this.state.locationVersion+1});await this.saveReadingPosition(false);if(token!==this.generation||this.closed)return;if(resume)await this.play();}catch(e){if(token===this.generation)this.fail(e);}
  }
  async skip(delta:number){const chapter=this.state.chapter;if(this.state.chapterLoading||!chapter)return;const next=this.state.index+delta;
    if(next>=0&&next<chapter.chunks.length)return this.seek(chapter.id,next);
    return this.changeChapter(delta);
  }
  async changeChapter(delta:number){
    const book=this.state.book,chapter=this.state.chapter;
    if(this.closed||this.state.chapterLoading||!book||!chapter)return;
    const resume=this.state.playing, navigation=++this.navigationVersion;
    this.set({chapterLoading:delta>0?"next":"previous",error:"",notice:""});
    let token=this.generation;
    try{
      const index=book.chapters.findIndex(c=>c.id===chapter.id),ch=book.chapters[index+delta];
      if(ch){await this.seek(ch.id,0,resume);return;}
      if(delta<0){this.set({notice:"已经是第一章"});return;}
      await this.pause("正在加载下一章");token=this.generation;
      if(navigation!==this.navigationVersion||this.closed||!await this.claim())return;
      const next=await this.next(chapter);
      if(navigation!==this.navigationVersion||!this.valid(token))return;
      if(!next){await this.pause("就绪");if(resume)await this.play();if(navigation===this.navigationVersion)this.set({notice:"没有可加载的下一章"});return;}
      const currentBook=this.state.book!;
      if(!currentBook.chapters.some(c=>c.id===next.id))this.set({book:{...currentBook,chapters:[...currentBook.chapters,{id:next.id,title:next.title}]}});
      await this.seek(next.id,0,resume);
    }catch(e){if(navigation===this.navigationVersion&&token===this.generation&&!this.closed)this.fail(e);}
    finally{if(navigation===this.navigationVersion)this.set({chapterLoading:null});}
  }
  async update(patch:Partial<NovelPreferences>){
    if(!this.state.book)return;const old=this.state.book.preferences,prefs={...old,...patch};
    const restart=old.voiceId!==prefs.voiceId||old.engine!==prefs.engine;const resume=this.state.playing;
    if(restart)await this.pause();this.set({book:{...this.state.book!,preferences:prefs}});
    if(this.audio){this.audio.volume=prefs.volume;this.audio.playbackRate=prefs.rate;}
    if(this.utterance&&(old.rate!==prefs.rate||old.volume!==prefs.volume)){await this.pause();}
    this.preferenceWrites=this.preferenceWrites.catch(()=>{}).then(()=>this.request("preferences",{preferences:prefs}));
    await this.preferenceWrites.catch(e=>this.set({error:String(e)}));
    if(resume&&(restart||old.engine==="system"))await this.play();
  }
  async preview(){await this.pause();const token=this.generation;try{if(!await this.claim())return;this.set({preview:true,status:"正在生成试听",error:""});const clip=await this.request<Clip>("preview",{sessionId:this.session,voiceId:this.state.book!.preferences.voiceId});if(this.valid(token))await this.playClip(clip,token,true);}catch(e){if(this.valid(token))this.fail(e);}}
  fail(e:unknown){void this.pause("已停止，可重试");this.set({error:e instanceof Error?e.message:String(e)});}
  close(){++this.navigationVersion;this.set({chapterLoading:null});void this.pause();this.closed=true;this.channel?.close();this.channel=null;}
}
