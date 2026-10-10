import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { z } from "zod";
import { load } from "cheerio";
import { getProfileDataDir } from "@/lib/profiles";

const selector = z.string().trim().min(1).max(200).refine(value => {
  try { load("<article></article>")(value); return true; } catch { return false; }
}, "无效的 CSS 选择器");
const origin = z.string().url().refine(value => {
  const u = new URL(value);
  return u.protocol === "https:" && u.origin === value && !u.username && !u.password && (!u.port || u.port === "443");
}, "站点必须是完整 HTTPS 来源，不含路径、账号或非标准端口");
const baseSchema = z.object({
  format: z.literal("resources-manager.web-novel.v1"),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name: z.string().trim().min(1).max(80),
  version: z.string().trim().min(1).max(40),
  license: z.string().trim().min(1).max(100),
  // Unverified sources must not masquerade as a verified permission grant.
  authorization: z.object({ basis: z.enum(["unverified", "own-content", "permission", "public-domain"]), statement: z.string().trim().min(20).max(2000), reference: z.string().url().refine(value=>{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password;},"来源说明必须是 HTTPS 链接") }).strict(),
  origins: z.array(origin).min(1).max(10),
}).strict();
const htmlSchema = baseSchema.extend({
  transport: z.enum(["http", "browser"]).optional(),
  allowMissingTitles: z.boolean().optional(),
  metadata: z.object({
    tags: selector.optional(), cover: selector.optional(),
    coverOrigins: z.array(origin).max(10).optional(),
    details: z.object({
      request: z.string().max(300).regex(/^\/(?:[a-zA-Z0-9._~/-]|\{[0-9]\})+$/),
      bookTitle: selector.optional(), tags: selector.optional(), cover: selector.optional(),
    }).strict().optional(),
  }).strict().optional(),
  selectors: z.object({ content: selector, title: selector, bookTitle: selector, bookLink: selector.optional(), next: selector.optional(), exclude: selector.optional(), comments: selector.optional() }).strict(),
}).strict();
const jsonField = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/);
const jsonFields = z.array(jsonField).min(1).max(8);
const routeTemplate = z.string().max(300).regex(/^\/(?:[a-zA-Z0-9._~/-]|\{[0-9]\}|\{next\})+$/);
const jsonSchema = baseSchema.extend({
  transport: z.literal("json"),
  json: z.object({
    browser: z.boolean().optional(),
    pathPrefix: z.string().max(100).regex(/^\/(?:[a-zA-Z0-9_-]+\/)+$/),
    request: routeTemplate.refine(value => !value.includes("{next}"), "章节接口不能依赖下一章编号"),
    bookURL: routeTemplate.refine(value => !value.includes("{next}"), "书籍链接不能依赖下一章编号"),
    nextURL: routeTemplate,
    title: jsonFields, bookTitle: jsonFields, content: jsonFields, next: jsonField,
  }).strict(),
}).strict();
const schema = z.union([htmlSchema, jsonSchema]);
export type WebExtension = z.infer<typeof schema>;
export function validateWebExtension(value: unknown) {
  const json = !!value && typeof value === "object" && "transport" in value && value.transport === "json";
  const result = (json ? jsonSchema : htmlSchema).safeParse(value);
  if (result.success) return result.data;
  const labels: Record<string, string> = {
    format: "协议格式", id: "扩展 ID", name: "扩展名称", version: "版本", license: "扩展许可证",
    authorization: "来源声明", "authorization.basis": "来源状态", "authorization.statement": "来源说明（至少 20 字）",
    "authorization.reference": "来源说明 HTTPS 链接", origins: "允许的 HTTPS 来源", selectors: "CSS 规则",
    "selectors.content": "正文 CSS", "selectors.title": "章节标题 CSS", "selectors.bookTitle": "书名 CSS",
    "selectors.bookLink": "目录链接 CSS", "selectors.next": "下一章 CSS",
    "selectors.exclude": "正文排除 CSS",
    "selectors.comments": "评论 CSS",
    allowMissingTitles: "缺失标题时保留正文",
    metadata: "书籍信息规则", "metadata.coverOrigins": "封面 HTTPS 来源", "metadata.details.request": "书籍详情路径模板",
    json: "公开接口配置", "json.request": "章节接口路径", "json.bookURL": "书籍路径", "json.nextURL": "下一章路径",
    transport: "网页读取方式",
  };
  const issues = result.error.issues.slice(0, 3).map(issue => {
    const key = issue.path.filter(part => typeof part === "string").join(".");
    const label = labels[key] || "声明字段";
    return /[\u4e00-\u9fff]/.test(issue.message) ? `${label}：${issue.message}` : `请检查${label}`;
  });
  throw new Error(`扩展声明无效：${issues.join("；")}`);
}
export type InstalledWebExtension = { extension: WebExtension; enabled: boolean };
const file = (profileId: string) => path.join(getProfileDataDir(profileId), "web-novel-extensions.json");
const legacyFile = (profileId: string) => path.join(getProfileDataDir(profileId), "web-novel-extension.json");
const registrySchema = z.object({ version: z.literal(1), extensions: z.array(z.object({ extension: schema, enabled: z.boolean() }).strict()).max(64) }).strict();
export function webExtensions(profileId: string): InstalledWebExtension[] {
  const registry = file(profileId);
  if (fs.existsSync(registry)) {
    const value = registrySchema.parse(JSON.parse(fs.readFileSync(registry, "utf8")));
    if (new Set(value.extensions.map(entry => entry.extension.id)).size !== value.extensions.length) throw new Error("网页扩展配置有重复 ID，请检查配置文件");
    return value.extensions;
  }
  // Read old single-extension installs without changing files until a user edit.
  try { return [{ extension: validateWebExtension(JSON.parse(fs.readFileSync(legacyFile(profileId), "utf8"))), enabled: true }]; }
  catch { return []; }
}
export function webExtension(profileId: string): WebExtension | null {
  return webExtensions(profileId).filter(entry => entry.enabled).at(-1)?.extension || null;
}
export function webExtensionForURL(profileId: string, value: string): WebExtension {
  const entries = webExtensions(profileId), url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("请输入有效的 HTTPS 章节链接");
  if (!entries.length) throw new Error("请先自行安装有来源声明的网页扩展；本地章节不受影响");
  const supported = entries.filter(entry => entry.extension.origins.includes(url.origin));
  const enabled = supported.filter(entry => entry.enabled);
  if (!supported.length) throw new Error("尚未安装此网站的扩展，请在网站扩展管理中添加对应扩展");
  if (!enabled.length) throw new Error("此网站的扩展已停用，请在网站扩展管理中勾选启用");
  if (enabled.length > 1) throw new Error(`多个扩展匹配此网站（${enabled.map(entry => entry.extension.name).join("、")}），请在网站扩展管理中仅启用其中一个`);
  return enabled[0].extension;
}
function saveExtensions(profileId: string, extensions: InstalledWebExtension[]) {
  const value = registrySchema.parse({ version: 1, extensions });
  const dest = file(profileId), temp = `${dest}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 }); fs.renameSync(temp, dest); }
  finally { fs.rmSync(temp, { force: true }); }
}
export function installWebExtension(profileId: string, value: unknown, confirmed: unknown) {
  if (confirmed !== true) throw new Error("安装网页扩展前需要确认来源声明与访问范围");
  const extension = validateWebExtension(value), entries = webExtensions(profileId);
  const index = entries.findIndex(entry => entry.extension.id === extension.id);
  if (index < 0) entries.push({ extension, enabled: true });
  else entries[index] = { extension, enabled: entries[index].enabled };
  saveExtensions(profileId, entries);
  return extension;
}
export function setWebExtensionEnabled(profileId: string, id: unknown, enabled: unknown) {
  if (typeof id !== "string" || typeof enabled !== "boolean") throw new Error("请选择扩展及有效的启用状态");
  const entries = webExtensions(profileId), entry = entries.find(value => value.extension.id === id);
  if (!entry) throw new Error("网页扩展不存在，请刷新管理页面");
  if (entry.enabled !== enabled) { entry.enabled = enabled; saveExtensions(profileId, entries); }
  return { id, enabled };
}
export function removeWebExtension(profileId: string, id?: unknown) {
  const entries = webExtensions(profileId);
  if (id === undefined && entries.length > 1) throw new Error("请指定要移除的网页扩展，不会清空其他扩展");
  if (id !== undefined && (typeof id !== "string" || !entries.some(entry => entry.extension.id === id))) throw new Error("网页扩展不存在，请刷新管理页面");
  saveExtensions(profileId, id === undefined ? [] : entries.filter(entry => entry.extension.id !== id));
}
export function assertWebOrigin(extension: WebExtension, value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || !extension.origins.includes(u.origin)) throw new Error("网页扩展未授权访问此站点");
}
