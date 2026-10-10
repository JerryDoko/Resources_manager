import { assertWebOrigin, type WebExtension } from "./web-extensions";
import type { WebChapter } from "./web-import";

type JSONExtension = Extract<WebExtension, { transport: "json" }>;
function route(template: string, source: string, extension: JSONExtension, next?: string) {
  const url = new URL(source);
  assertWebOrigin(extension, source);
  if (!url.pathname.startsWith(extension.json.pathPrefix)) throw new Error("此链接不是扩展支持的章节路径");
  const parts = url.pathname.slice(extension.json.pathPrefix.length).split("/");
  if (!parts.length || parts.some(part => !/^[a-zA-Z0-9_-]{1,128}$/.test(part))) throw new Error("章节链接中的编号无效");
  const path = template.replace(/\{([0-9]|next)\}/g, (_match, key: string) => {
    const value = key === "next" ? next : parts[Number(key)];
    if (!value || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error("章节接口缺少有效编号");
    return encodeURIComponent(value);
  });
  const target = new URL(path, url.origin);
  if (target.origin !== url.origin) throw new Error("公开接口路径不能跳转到其他网站");
  assertWebOrigin(extension, target.href);
  return target.href;
}
export function jsonRequestURL(source: string, extension: JSONExtension) {
  return route(extension.json.request, source, extension);
}
export function assertJSONResponseURL(request: string, response: string) {
  if (new URL(request).href !== new URL(response).href) throw new Error("章节接口跳转到其他路径，已停止导入");
}
export function parseWebJSONChapter(raw: string, source: string, extension: JSONExtension): WebChapter {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("网站没有返回有效的章节 JSON，可能需要登录或验证"); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("网站章节接口结构无效");
  const record = data as Record<string, unknown>;
  const field = (key: string) => Object.hasOwn(record, key) ? record[key] : undefined;
  const firstText = (keys: string[]) => keys.map(field).find(value => typeof value === "string" && value.trim());
  const title = firstText(extension.json.title), bookTitle = firstText(extension.json.bookTitle);
  if (typeof title !== "string" || typeof bookTitle !== "string") throw new Error("公开接口未返回书名或章节标题");
  const paragraphs = extension.json.content.map(field).find(value => Array.isArray(value) && value.length <= 20000 && value.every(part => typeof part === "string") && value.some(part => part.trim()));
  if (!Array.isArray(paragraphs)) throw new Error("此章节没有扩展指定的译文，请在原站确认译文已生成；不会自动改读其他语言");
  const text = paragraphs.map(part => part.trim()).filter(Boolean).join("\n\n");
  if (text.length < 30) throw new Error("网页没有足够的章节正文");
  const sourceKey = route(extension.json.bookURL, source, extension);
  const next = field(extension.json.next);
  let nextURL: string | undefined;
  if (next !== undefined && next !== null && next !== "") {
    if (typeof next !== "string" && !(typeof next === "number" && Number.isSafeInteger(next) && next >= 0)) throw new Error("公开接口返回了无效的下一章编号");
    const target = route(extension.json.nextURL, source, extension, String(next));
    if (target !== source && target !== sourceKey) nextURL = target;
  }
  return { title: title.trim(), bookTitle: bookTitle.trim(), text, sourceKey, sourceURL: source, nextURL };
}
