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
const schema = z.object({
  format: z.literal("resources-manager.web-novel.v1"),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  name: z.string().trim().min(1).max(80),
  version: z.string().trim().min(1).max(40),
  license: z.string().trim().min(1).max(100),
  // This is the publisher's assertion, not verification of a site's legal status.
  authorization: z.object({ basis: z.enum(["own-content", "permission", "public-domain"]), statement: z.string().trim().min(20).max(2000), reference: z.string().url().refine(value=>{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password;},"授权声明必须是 HTTPS 链接") }).strict(),
  origins: z.array(origin).min(1).max(10),
  selectors: z.object({ content: selector, title: selector, bookTitle: selector, bookLink: selector.optional(), next: selector.optional() }).strict(),
}).strict();
export type WebExtension = z.infer<typeof schema>;
export const validateWebExtension = (value: unknown) => schema.parse(value);
const file = (profileId: string) => path.join(getProfileDataDir(profileId), "web-novel-extension.json");
export function webExtension(profileId: string): WebExtension | null {
  try { return validateWebExtension(JSON.parse(fs.readFileSync(file(profileId), "utf8"))); } catch { return null; }
}
export function installWebExtension(profileId: string, value: unknown, confirmed: unknown) {
  if (confirmed !== true) throw new Error("安装网页扩展前需要确认来源授权与访问范围");
  const extension = validateWebExtension(value), dest = file(profileId), temp = `${dest}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.writeFileSync(temp, JSON.stringify(extension, null, 2), { mode: 0o600 }); fs.renameSync(temp, dest); }
  finally { fs.rmSync(temp, { force: true }); }
  return extension;
}
export function removeWebExtension(profileId: string) { fs.rmSync(file(profileId), { force: true }); }
export function assertWebOrigin(extension: WebExtension, value: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || !extension.origins.includes(u.origin)) throw new Error("网页扩展未授权访问此站点");
}
