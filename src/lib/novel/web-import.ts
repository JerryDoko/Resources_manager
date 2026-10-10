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
import { getChapter, importChapters, novelItem, readChapters, type ImportedChapter } from "./repository";
import { assertWebOrigin, webExtensionForURL, type WebExtension } from "./web-extensions";
import { assertJSONResponseURL, jsonRequestURL, parseWebJSONChapter } from "./web-json";
import { assertCoverURL, expandWebTemplate, parseWebMetadata, saveWebMetadata, type WebBookMetadata } from "./web-metadata";

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
async function downloadResource(input:string,extension:WebExtension,signal?:AbortSignal,redirect=0,image=false):Promise<{data:Buffer;url:string;contentType?:string}> {
  if(redirect>4)throw new Error("网页重定向过多");const url=normalizeURL(input),u=new URL(url),host=u.hostname.replace(/^\[|\]$/g,"");
  if(image)assertCoverURL(url,extension);else assertWebOrigin(extension,url);
  const addresses=await lookup(host,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error("不能导入本机或内网地址");
  const chosen=addresses[0];
  return new Promise((resolve,reject)=>{
    const req=(u.protocol==="https:"?https:http).get(u,{signal,family:chosen.family,headers:{"User-Agent":"ResourcesManager-Novel/1.0","Accept":image?"image/*":"text/html","Accept-Encoding":"identity"},lookup:(_host,_opts,cb)=>cb(null,chosen.address,chosen.family)},res=>{
      if(res.statusCode&&[301,302,303,307,308].includes(res.statusCode)) {res.resume();clearTimeout(timer);if(!res.headers.location)return reject(new Error("重定向缺少地址"));downloadResource(new URL(res.headers.location,url).href,extension,signal,redirect+1,image).then(resolve,reject);return;}
      if(res.statusCode!==200){res.resume();clearTimeout(timer);return reject(new Error(res.statusCode===403 ? "网站拒绝自动读取（403），可能需要浏览器安全验证；请使用浏览器读取扩展或导入本地 TXT/EPUB" : `网站返回 ${res.statusCode}`));}
      let size=0;const chunks:Buffer[]=[];
      res.on("data",chunk=>{size+=chunk.length;if(size>(image?6:4)*1024*1024){req.destroy(new Error(image?"封面超过 6 MB":"网页超过 4 MB"));return;}chunks.push(chunk);});
      res.on("end",()=>{clearTimeout(timer);resolve({data:Buffer.concat(chunks),contentType:res.headers["content-type"],url});});res.on("error",reject);
    });
    const timer=setTimeout(()=>req.destroy(new Error("网页下载超时，请重试")),30000);
    req.on("error",e=>{clearTimeout(timer);reject(e);});
  });
}
export async function downloadPage(input:string,extension:WebExtension,signal?:AbortSignal,redirect=0):Promise<{html:string;url:string}> {
  const result=await downloadResource(input,extension,signal,redirect);
  return {html:decodeWebPage(result.data,result.contentType),url:result.url};
}
export interface WebChapter extends ImportedChapter, WebBookMetadata { bookTitle:string;sourceKey:string;sourceURL:string;notice?:string }
export function assertChapterPage(html: string) {
  const $ = load(html), title = $("title").text();
  if (/會員登入|会员登录|登入\s*\/\s*註冊|登录\s*\/\s*注册/.test(title) || $("form.login-box").length) throw new Error("此章节需要网站会员登录，应用不会绕过登录；请提供正常打开后的 HTML 以校验扩展，或导入有权使用的本地文件");
  if (/正在验证浏览器|正在进行安全验证|Just a moment|请稍候|Checking your browser/i.test(title) || $("#challenge-running, #challenge-stage, script[src*='/cdn-cgi/challenge-platform/']").length) {
    throw new Error("网站返回安全验证页而不是章节正文，请使用浏览器读取扩展，或导入本地 TXT/EPUB；应用不会绕过验证码");
  }
}
export function parseWebChapter(html:string,source:string,extension:WebExtension):WebChapter {
  if (extension.transport === "json") throw new Error("公开接口扩展不能按 HTML 解析");
  assertChapterPage(html);
  const url=normalizeURL(source),$=load(html);
  assertWebOrigin(extension,url);
  const s=extension.selectors;
  const index=s.bookLink?$(s.bookLink).first().attr("href"):undefined;
  const indexURL=index?normalizeURL(new URL(index,url).href):null;
  if(indexURL)assertWebOrigin(extension,indexURL);
  // Keep the legacy URL source key so reinstalling an adapter cannot duplicate a book.
  const sourceKey=indexURL || new URL(".",url).href;
  const label=(css:string)=>{const el=$(expandWebTemplate(css,url)).first();return (el.attr("content")||el.text()).trim();};
  let bookTitle=label(s.bookTitle),title=label(s.title);
  let notice:string|undefined;
  if(!bookTitle||!title){
    if(!extension.allowMissingTitles)throw new Error("网页扩展未匹配到书名或章节标题");
    const path=new URL(url).pathname.split("/").filter(Boolean);
    bookTitle ||= `网页小说（${path.at(-2)||new URL(url).hostname}）`;
    title ||= label("title")||`章节 ${path.at(-1)||1}`;
    notice="正文已保存；网站未提供匹配的书名或章节标题，暂用页面标题或来源编号。";
  }
  const nextHref=s.next?$(s.next).first().attr("href"):undefined;
  let nextURL:string|undefined;
  if(nextHref){const n=normalizeURL(new URL(nextHref,url).href);assertWebOrigin(extension,n);if(n!==url&&n!==indexURL)nextURL=n;}
  if(!$(s.content).length)throw new Error("网页扩展未匹配到正文，不支持登录或验证码页面");
  const plainText = (node: ReturnType<typeof $>) => {
    node.find("script,style,iframe,noscript,button,nav,aside,form,input,textarea,select").remove();
    if(s.exclude)node.find(s.exclude).remove();
    node.find("br").replaceWith("\n");node.find("p,div,section,blockquote").append("\n\n");
    return node.text().replace(/\r/g,"").replace(/\n[ \t]+/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
  };
  const comments = s.comments ? $(s.comments).filter((_, node) => !$(node).parents(s.comments!).length).slice(0,500).toArray().map(node => plainText($(node).clone()).slice(0,20000)).filter(Boolean) : undefined;
  const body=$(s.content).first().clone();if(s.comments)body.find(s.comments).remove();
  const text=plainText(body);
  if(text.length<30)throw new Error("网页没有足够的章节正文");return {...parseWebMetadata(html,url,extension),bookTitle,sourceKey,title,text,sourceURL:url,nextURL,...(comments ? {comments} : {}),...(notice?{notice}:{})};
}
const scope=globalThis as typeof globalThis & { rmNovelDownloads?:Map<string,Promise<WebChapter>> };
const downloads=scope.rmNovelDownloads ||= new Map();
async function requestBrowser(profileId: string, url: string, extension: WebExtension, openOnly = false, metadataOnly = false, coverOnly = false) {
  if (extension.transport !== "browser" && !(extension.transport === "json" && extension.json.browser)) throw new Error("扩展未选择浏览器读取");
  if(coverOnly)assertCoverURL(url,extension);else assertWebOrigin(extension, url);
  const endpoint = process.env.RM_NOVEL_BROWSER_URL, token = process.env.RM_NOVEL_BROWSER_TOKEN;
  if (!endpoint || !token) throw new Error("此站点需要内置浏览器读取，请使用 Start Resources Manager.command 启动桌面应用，不能只启动网页服务");
  const local = new URL(endpoint);
  if (local.hostname !== "127.0.0.1" || local.protocol !== "http:" || local.pathname !== "/chapter") throw new Error("内置浏览器连接无效");
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ profileId, url: normalizeURL(url), origins: extension.origins, ...(openOnly ? { mode: "open" } : coverOnly&&extension.transport!=="json" ? {mode:"cover",coverOrigins:extension.metadata?.coverOrigins||[]} : metadataOnly ? {mode:"metadata",content:"body"} : extension.transport === "json" ? { format: "json" } : { content: extension.selectors.content, comments: extension.selectors.comments }) }), signal: AbortSignal.timeout(openOnly||metadataOnly||coverOnly ? 15000 : 300000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "浏览器读取失败");
  return result;
}
export async function openWebBrowser(profileId: string, url: string) {
  const guard = captureNovelWorkspace(profileId);
  const extension = webExtensionForURL(profileId, url);
  await requestBrowser(profileId, url, extension, true); guard();
  return { opened: true };
}
async function downloadBrowserPage(profileId: string, url: string, extension: WebExtension) {
  const result = await requestBrowser(profileId, url, extension);
  if (typeof result.html !== "string" || Buffer.byteLength(result.html) > 4 * 1024 * 1024 || typeof result.url !== "string") throw new Error("浏览器返回内容无效");
  assertWebOrigin(extension, result.url);
  return result as { html: string; url: string };
}
export function fetchChapter(profileId:string,url:string) {
  const extension=webExtensionForURL(profileId,url);
  assertWebOrigin(extension,url);
  const key=`${profileId}:${JSON.stringify(extension)}:${normalizeURL(url)}`;let task=downloads.get(key);
  if (!task) {
    const requestURL = extension.transport === "json" ? jsonRequestURL(normalizeURL(url), extension) : url;
    const browser = extension.transport === "browser" || (extension.transport === "json" && extension.json.browser);
    task = (browser ? downloadBrowserPage(profileId, requestURL, extension) : downloadPage(requestURL, extension)).then(async page => {
      const current = webExtensionForURL(profileId, url);
      if (JSON.stringify(current) !== JSON.stringify(extension)) throw new Error("网页扩展已变更，下载已取消");
      try {
        if (extension.transport === "json") {
          assertJSONResponseURL(requestURL, page.url);
          return parseWebJSONChapter(page.html, normalizeURL(url), extension);
        }
        return parseWebChapter(page.html, page.url, extension);
      } catch (error) {
        if (browser) {
          // A matching body can still lack a chapter title. Keep a normal page available for inspection.
          captureNovelWorkspace(profileId)();
          try {
            await requestBrowser(profileId, url, extension, true);
          } catch (openError) {
            throw new Error(`${error instanceof Error ? error.message : String(error)}；打开网页失败：${openError instanceof Error ? openError.message : String(openError)}`);
          }
          throw new Error(`${error instanceof Error ? error.message : String(error)}。已打开网页窗口，可核对页面后校验扩展规则。`);
        }
        throw error;
      }
    });
    downloads.set(key, task);
    void task.finally(() => downloads.delete(key)).catch(() => {});
  }
  return task;
}
export async function importWeb(profileId:string,url:string) {
  const guard=captureNovelWorkspace(profileId);const page=await fetchChapter(profileId,url);guard();
  const result=importChapters(profileId,page.sourceKey,page.bookTitle,[page]);
  const extension=webExtensionForURL(profileId,url), notices:string[]=page.notice?[page.notice]:[];
  let info:WebBookMetadata={bookTitle:page.bookTitle,...(page.tags?{tags:page.tags}:{}),...(page.coverURL?{coverURL:page.coverURL}:{})};
  if(extension.transport!=="json"&&extension.metadata?.details){
    try{
      const target=normalizeURL(new URL(expandWebTemplate(extension.metadata.details.request,page.sourceURL),page.sourceURL).href);
      const details=extension.transport==="browser"?await requestBrowser(profileId,target,extension,false,true):await downloadPage(target,extension,AbortSignal.timeout(8000));guard();
      if(details.url!==target)throw new Error("详情页跳转到其他页面，可能需要登录");
      assertChapterPage(details.html);
      const extracted=parseWebMetadata(details.html,details.url,extension,true,page.sourceURL);
      info={...info,...extracted,tags:[...new Set([...(info.tags||[]),...(extracted.tags||[])])]};
      if(!extracted.coverURL)notices.push("正文已保存，详情页未匹配到封面，可稍后补充。");
    }catch(e){guard();notices.push(`正文已保存，书籍详情补取失败：${e instanceof Error?e.message:String(e)}`);}
  }
  let cover:Buffer|undefined;
  if(info.coverURL){
    try{cover=(await downloadResource(info.coverURL,extension,AbortSignal.timeout(8000),0,true)).data;guard();}
    catch(e){
      guard();
      try{
        const result=await requestBrowser(profileId,info.coverURL,extension,false,false,true);guard();
        if(typeof result.imageBase64!=="string"||result.imageBase64.length>8*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(result.imageBase64))throw new Error("浏览器封面内容无效");
        cover=Buffer.from(result.imageBase64,"base64");
      }catch{guard();notices.push(`封面下载失败：${e instanceof Error?e.message:String(e)}`);}
    }
  }
  try{await saveWebMetadata(profileId,result.itemId,info,cover);guard();}
  catch(e){guard();await saveWebMetadata(profileId,result.itemId,info);notices.push(`封面保存失败：${e instanceof Error?e.message:String(e)}`);}
  const item=novelItem(profileId,result.itemId);
  return {...result,title:item.title,collectionPath:item.path,tags:info.tags||[],...(info.coverURL?{coverURL:info.coverURL}:{}),...(notices.length?{notice:notices.join("\n")}:{})};
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
