import { load } from "cheerio";
import { lookup } from "dns/promises";
import http from "http";
import https from "https";
import { BlockList, isIP } from "net";
import { decodeNovelBuffer } from "@/lib/encoding";
import { getSqlite } from "@/lib/db";
import { withProfile } from "@/lib/profiles";
import { assertSession, captureNovelWorkspace } from "./sessions";
import { getChapter, importChapters, readChapters, type ImportedChapter } from "./repository";

export function normalizeURL(value:string) {
  const u=new URL(value);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw new Error("请输入有效的 HTTP/HTTPS 章节链接");
  if(u.port&&!['80','443'].includes(u.port))throw new Error("不支持该网址端口");
  u.hash="";for(const k of [...u.searchParams.keys()])if(/^utm_|^fbclid$/.test(k))u.searchParams.delete(k);return u.href;
}
const blocked=new BlockList(),blocked6=new BlockList();
for(const [base,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.168.0.0",16],["192.0.0.0",24],["192.0.2.0",24],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const)blocked.addSubnet(base,prefix,"ipv4");
for(const [base,prefix] of [["::",128],["::1",128],["fc00::",7],["fe80::",10],["ff00::",8],["2001:db8::",32],["::ffff:0:0",96],["64:ff9b::",96],["2002::",16]] as const)blocked6.addSubnet(base,prefix,"ipv6");
export const publicAddress=(address:string)=>isIP(address)===4?!blocked.check(address,"ipv4"):isIP(address)===6&&!blocked6.check(address,"ipv6");
export async function downloadPage(input:string,signal?:AbortSignal,redirect=0):Promise<{html:string;url:string}> {
  if(redirect>4)throw new Error("网页重定向过多");const url=normalizeURL(input),u=new URL(url),host=u.hostname.replace(/^\[|\]$/g,"");
  const addresses=await lookup(host,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error("不能导入本机或内网地址");
  const chosen=addresses[0];
  return new Promise((resolve,reject)=>{
    const req=(u.protocol==="https:"?https:http).get(u,{signal,family:chosen.family,headers:{"User-Agent":"ResourcesManager-Novel/1.0","Accept":"text/html","Accept-Encoding":"identity"},lookup:(_host,_opts,cb)=>cb(null,chosen.address,chosen.family)},res=>{
      if(res.statusCode&&[301,302,303,307,308].includes(res.statusCode)) {res.resume();clearTimeout(timer);if(!res.headers.location)return reject(new Error("重定向缺少地址"));downloadPage(new URL(res.headers.location,url).href,signal,redirect+1).then(resolve,reject);return;}
      if(res.statusCode!==200){res.resume();clearTimeout(timer);return reject(new Error(`网站返回 ${res.statusCode}`));}
      let size=0;const chunks:Buffer[]=[];
      res.on("data",chunk=>{size+=chunk.length;if(size>4*1024*1024){req.destroy(new Error("网页超过 4 MB"));return;}chunks.push(chunk);});
      res.on("end",()=>{clearTimeout(timer);resolve({html:decodeNovelBuffer(Buffer.concat(chunks)).text,url});});res.on("error",reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error("网页下载超时，请重试")),30000);
    req.on("error",e=>{clearTimeout(timer);reject(e);});
  });
}
export interface WebChapter extends ImportedChapter { bookTitle:string;sourceKey:string;sourceURL:string }
export function parseWebChapter(html:string,source:string):WebChapter {
  const url=normalizeURL(source),$=load(html);
  const anchors=$("a[href]").toArray();
  const index=$("a[rel=index],#info_url").first().attr("href") || anchors.map(a=>$(a).attr("href")!).find(h=>/\/book\//.test(h));
  const indexURL=index?normalizeURL(new URL(index,url).href):null;
  const readId=new URL(url).pathname.match(/\/read\/([^/]+)\//)?.[1];
  const sourceKey=indexURL || (readId?`${new URL(url).origin}/book/${readId}`:new URL(".",url).href);
  const bookAnchor=anchors.find(a=>/\/book\//.test($(a).attr("href")||"")&&!/^(目录|目錄|书架|書架)$/.test($(a).text().trim()));
  const bookTitle=$("meta[property='og:novel:book_name']").attr("content")|| (bookAnchor?$(bookAnchor).text().trim():"") || $("title").text().split("_")[1] || new URL(url).hostname;
  const title=$("h1").first().text().trim()||$("title").text().split("_")[0]||"正文";
  const nextEl=$("a[rel=next],#next_url").first();
  const nextHref=nextEl.attr("href")||anchors.map(a=>({href:$(a).attr("href"),text:$(a).text().trim()})).find(a=>/^(下一章|下一页|下一頁)$/.test(a.text))?.href;
  let nextURL:string|undefined;
  if(nextHref){try{const n=normalizeURL(new URL(nextHref,url).href);if(new URL(n).origin===new URL(url).origin&&n!==url&&n!==indexURL&&!/\/book\//.test(new URL(n).pathname))nextURL=n;}catch{/* Invalid next links terminate the book. */}}
  const selector=["#booktxt","#chaptercontent","#BookText",".readcontent","#content","article"].find(s=>$(s).length);
  if(!selector)throw new Error("未识别到小说正文，页面可能需要登录或验证码");
  const body=$(selector).first();body.find("script,style,iframe,noscript,button,nav,.ads,.advertisement,#play,.navigation").remove();body.find("br").replaceWith("\n");body.find("p,div,section").append("\n\n");
  const text=body.text().replace(/\r/g,"").replace(/\n[ \t]+/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
  if(text.length<30)throw new Error("网页没有足够的章节正文");return {bookTitle,sourceKey,title,text,sourceURL:url,nextURL};
}
const scope=globalThis as typeof globalThis & { rmNovelDownloads?:Map<string,Promise<WebChapter>> };
const downloads=scope.rmNovelDownloads ||= new Map();
export function fetchChapter(profileId:string,url:string) {
  const key=`${profileId}:${normalizeURL(url)}`;let task=downloads.get(key);
  if(!task){task=downloadPage(url).then(p=>parseWebChapter(p.html,p.url));downloads.set(key,task);void task.finally(()=>downloads.delete(key)).catch(()=>{});}return task;
}
export async function importWeb(profileId:string,url:string) {
  const guard=captureNovelWorkspace(profileId);const page=await fetchChapter(profileId,url);guard();
  return importChapters(profileId,page.sourceKey,page.bookTitle,[page]);
}
export async function nextChapter(profileId:string,itemId:string,chapterId:string,sessionId:string,encoding="auto") {
  assertSession(profileId,itemId,sessionId);
  const {chapters}=await readChapters(profileId,itemId,encoding);assertSession(profileId,itemId,sessionId);
  const ci=chapters.findIndex(c=>c.id===chapterId);if(ci<0)throw new Error("章节不存在");const current=chapters[ci];
  if(!current.nextURL)return chapters[ci+1]||null;
  const cached=chapters.findIndex(c=>c.sourceURL===current.nextURL);
  if(cached>=0){if(cached<=ci)throw new Error("下一章链接回到已读章节，已停止");return chapters[cached];}
  const page=await fetchChapter(profileId,current.nextURL);assertSession(profileId,itemId,sessionId);
  const source=withProfile(profileId,()=>getSqlite().prepare("SELECT source_key FROM novel_sources WHERE item_id=?").get(itemId) as {source_key:string});
  if(source?.source_key!==page.sourceKey)throw new Error("下一章指向其他书籍或目录，已停止");
  if(chapters.slice(0,ci+1).some(c=>c.sourceURL===page.sourceURL))throw new Error("下一章链接出现回环，已停止");
  const result=importChapters(profileId,page.sourceKey,page.bookTitle,[page]);
  return getChapter(profileId,itemId,result.chapterIds[0],encoding);
}
