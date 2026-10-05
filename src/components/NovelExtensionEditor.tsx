"use client";
import { useState } from "react";
import { Download, PackagePlus } from "lucide-react";
import type { WebExtension } from "@/lib/novel/web-extensions";
import { novelFetch } from "@/lib/novel/client";

type Props = { profile: string; button: string; run: (fn: () => Promise<void>) => Promise<void>; install: (value: WebExtension) => Promise<void> };
export function NovelExtensionEditor({ profile, button, run, install }: Props) {
  const [fields, setFields] = useState({ id: "my-web-stories", name: "", origins: "", content: "article", title: "h1", bookTitle: "meta[name='book-title']", bookLink: "a[rel='index']", next: "a[rel='next']", statement: "", reference: "" });
  const [basis, setBasis] = useState<WebExtension["authorization"]["basis"]>("unverified");
  const validate = async () => {
    const value = { format: "resources-manager.web-novel.v1", id: fields.id.trim(), name: fields.name.trim(), version: "1.0.0", license: "MIT", authorization: { basis, statement: fields.statement.trim(), reference: fields.reference.trim() }, origins: fields.origins.split(/\s+/).filter(Boolean), selectors: { content: fields.content, title: fields.title, bookTitle: fields.bookTitle, ...(fields.bookLink.trim() ? { bookLink: fields.bookLink } : {}), ...(fields.next.trim() ? { next: fields.next } : {}) } };
    const form = new FormData(); form.set("profileId", profile); form.set("file", new File([JSON.stringify(value)], "manifest.json", { type: "application/json" }));
    const response = await novelFetch(`/api/novel/extensions?profileId=${encodeURIComponent(profile)}`, { method: "POST", body: form });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "扩展声明无效"); return data as WebExtension;
  };
  const input = "mt-1 w-full min-w-0 rounded-lg border border-[var(--line)] bg-white px-2 py-2 text-sm";
  return <details className="border-t border-[var(--line)] pt-3">
    <summary className="cursor-pointer text-xs font-medium">创建站点扩展</summary>
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">{([
        ["id", "扩展 ID", "小写英文、数字和连字符"], ["name", "扩展名称", "我的原创故事"],
        ["content", "正文 CSS", "article"], ["title", "章节标题 CSS", "h1"],
        ["bookTitle", "书名 CSS", "meta[name='book-title']"], ["bookLink", "目录链接 CSS（可选）", "a[rel='index']"],
        ["next", "下一章 CSS（可选）", "a[rel='next']"], ["reference", "来源说明 HTTPS 链接", "https://your-site.example/chapter"],
      ] as const).map(([key, label, placeholder]) => <label key={key} className="min-w-0 text-xs">{label}<input aria-label={label} value={fields[key]} placeholder={placeholder} className={input} onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}/></label>)}</div>
      <label className="block text-xs">允许的 HTTPS 来源（每行一个）<textarea aria-label="允许的 HTTPS 来源" className={input} rows={2} value={fields.origins} placeholder="https://your-site.example" onChange={e => setFields(f => ({ ...f, origins: e.target.value }))}/></label>
      <label className="block text-xs">来源状态<select aria-label="来源状态" className={input} value={basis} onChange={e => setBasis(e.target.value as typeof basis)}><option value="unverified">未核实来源授权</option><option value="own-content">原创内容</option><option value="permission">已取得许可</option><option value="public-domain">公版内容</option></select></label>
      <label className="block text-xs">来源说明<textarea aria-label="来源说明" rows={3} className={input} value={fields.statement} placeholder="如实填写内容来源和已知情况（至少 20 字）" onChange={e => setFields(f => ({ ...f, statement: e.target.value }))}/></label>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={() => void run(async () => install(await validate()))}><PackagePlus size={16}/>校验并安装</button>
        <button className={button} onClick={() => void run(async () => {
          const value = await validate(), url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" }));
          const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${value.id}.json`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        })}><Download size={16}/>下载扩展 JSON</button></div>
    </div>
  </details>;
}
