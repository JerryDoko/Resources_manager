import { load } from "cheerio";
import { lookup } from "dns/promises";
import http from "http";
import https from "https";
import { MIMEType } from "node:util";
import iconv from "iconv-lite";
import { BlockList, isIP } from "net";
import { decodeNovelBuffer } from "@/lib/encoding";
import { getSqlite } from "@/lib/db";
import { withProfile } from "@/lib/profiles";
import { assertSession, captureNovelWorkspace } from "./sessions";
import { getChapter, importChapters, readChapters, type ImportedChapter } from "./repository";
import { assertWebOrigin, webExtension, type WebExtension } from "./web-extensions";

export function normalizeURL(value:string) {
  const u=new URL(value);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)throw new Error("请输入有效的 HTTP/HTTPS 章节链接");
  if(u.port&&!['80','443'].includes(u.port))throw new Error("不支持该网址端口");
  u.hash="";for(const k of [...u.searchParams.keys()])if(/^utm_|^fbclid$/.test(k))u.searchParams.delete(k);return u.href;
}
const blocked=new BlockList(),blocked6=new BlockList();
for(const [base,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.168.0.0",16],["192.0.0.0",24],["192.0.2.0",24],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const)blocked.addSubnet(base,prefix,"ipv4");
for(const [base,prefix] of [["::",128],["::1",128],["fc00::",7],["fe80::",10],["ff00::",8],["2001:db8::",32],["::ffff:0:0",96],["64:ff9b::",96],["2002::",16]] as const)blocked6.addSubnet(base,prefix,"ipv6");
export const publicAddress=(address:string)=>isIP(address)===4?!blocked.check(address,"ipv4"):isIP(address)===6&&!blocked6.check(address,"ipv6");
export function decodeWebPage(data: Buffer, contentType?: string) {
  if ((data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) ||
      (data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff)) return decodeNovelBuffer(data).text;
  let charset: string | undefined;
  try { charset = contentType ? new MIMEType(contentType).params.get("charset") || undefined : undefined; } catch { /* Fall back to the document declaration. */ }
  const head = load(data.subarray(0, 1024).toString("latin1"));
  const metaCharset = head("meta[charset]").first().attr("charset");
  const metaType = head("meta[http-equiv]").filter((_, node) => head(node).attr("http-equiv")?.toLowerCase() === "content-type").first().attr("content");
  let metaEncoding = metaCharset;
  if (!metaEncoding && metaType) { try { metaEncoding = new MIMEType(metaType).params.get("charset") || undefined; } catch { /* Unknown declaration. */ } }
  for (const declared of [charset, metaEncoding]) {
    if (declared && iconv.encodingExists(declared.trim())) return iconv.decode(data, declared.trim());
  }
  // Valid UTF-8 must not be overruled by incidental kana in a heuristic decode.
  try { return new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { return decodeNovelBuffer(data).text; }
}
export async function downloadPage(input:string,extension:WebExtension,signal?:AbortSignal,redirect=0):Promise<{html:string;url:string}> {
  if(redirect>4)throw new Error("网页重定向过多");const url=normalizeURL(input),u=new URL(url),host=u.hostname.replace(/^\[|\]$/g,"");
  assertWebOrigin(extension,url);
  const addresses=await lookup(host,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error("不能导入本机或内网地址");
  const chosen=addresses[0];
  return new Promise((resolve,reject)=>{
    const req=(u.protocol==="https:"?https:http).get(u,{signal,family:chosen.family,headers:{"User-Agent":"ResourcesManager-Novel/1.0","Accept":"text/html","Accept-Encoding":"identity"},lookup:(_host,_opts,cb)=>cb(null,chosen.address,chosen.family)},res=>{
      if(res.statusCode&&[301,302,303,307,308].includes(res.statusCode)) {res.resume();clearTimeout(timer);if(!res.headers.location)return reject(new Error("重定向缺少地址"));downloadPage(new URL(res.headers.location,url).href,extension,signal,redirect+1).then(resolve,reject);return;}
      if(res.statusCode!==200){res.resume();clearTimeout(timer);return reject(new Error(`网站返回 ${res.statusCode}`));}
      let size=0;const chunks:Buffer[]=[];
      res.on("data",chunk=>{size+=chunk.length;if(size>4*1024*1024){req.destroy(new Error("网页超过 4 MB"));return;}chunks.push(chunk);});
      res.on("end",()=>{clearTimeout(timer);resolve({html:decodeWebPage(Buffer.concat(chunks),res.headers["content-type"]),url});});res.on("error",reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error("网页下载超时，请重试")),30000);
    req.on("error",e=>{clearTimeout(timer);reject(e);});
  });
}
export interface WebChapter extends ImportedChapter { bookTitle:string;sourceKey:string;sourceURL:string }
export function parseWebChapter(html:string,source:string,extension:WebExtension):WebChapter {
  const url=normalizeURL(source),$=load(html);
  assertWebOrigin(extension,url);
  const s=extension.selectors;
  const index=s.bookLink?$(s.bookLink).first().attr("href"):undefined;
  const indexURL=index?normalizeURL(new URL(index,url).href):null;
  if(indexURL)assertWebOrigin(extension,indexURL);
  // Keep the legacy URL source key so reinstalling an adapter cannot duplicate a book.
  const sourceKey=indexURL || new URL(".",url).href;
  const bookEl=$(s.bookTitle).first(),bookTitle=bookEl.attr("content")||bookEl.text().trim();
  const title=$(s.title).first().text().trim();
  if(!bookTitle||!title)throw new Error("网页扩展未匹配到书名或章节标题");
  const nextHref=s.next?$(s.next).first().attr("href"):undefined;
  let nextURL:string|undefined;
  if(nextHref){const n=normalizeURL(new URL(nextHref,url).href);assertWebOrigin(extension,n);if(n!==url&&n!==indexURL)nextURL=n;}
  if(!$(s.content).length)throw new Error("网页扩展未匹配到正文，不支持登录或验证码页面");
  const body=$(s.content).first();body.find("script,style,iframe,noscript,button,nav").remove();body.find("br").replaceWith("\n");body.find("p,div,section").append("\n\n");
  const text=body.text().replace(/\r/g,"").replace(/\n[ \t]+/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
  if(text.length<30)throw new Error("网页没有足够的章节正文");return {bookTitle,sourceKey,title,text,sourceURL:url,nextURL};
}
const scope=globalThis as typeof globalThis & { rmNovelDownloads?:Map<string,Promise<WebChapter>> };
const downloads=scope.rmNovelDownloads ||= new Map();
export function fetchChapter(profileId:string,url:string) {
  const extension=webExtension(profileId);if(!extension)throw new Error("请先自行安装有来源声明的网页扩展；本地章节不受影响");
  assertWebOrigin(extension,url);
  const key=`${profileId}:${JSON.stringify(extension)}:${normalizeURL(url)}`;let task=downloads.get(key);
  if(!task){task=downloadPage(url,extension).then(p=>{const current=webExtension(profileId);if(JSON.stringify(current)!==JSON.stringify(extension))throw new Error("网页扩展已变更，下载已取消");return parseWebChapter(p.html,p.url,extension);});downloads.set(key,task);void task.finally(()=>downloads.delete(key)).catch(()=>{});}return task;
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
