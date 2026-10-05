"use client";
import { Download, ExternalLink, PackagePlus, Upload } from "lucide-react";
import demo from "@/lib/novel/extension-demo.json";
import { EXAMPLE_CHAPTER_URL, EXTENSION_RELEASE_URL } from "@/lib/novel/extension-downloads";
import type { WebExtension } from "@/lib/novel/web-extensions";
import { novelFetch, novelRequest } from "@/lib/novel/client";
import { NovelHelpLink } from "./NovelHelpLink";
import { NovelExtensionEditor } from "./NovelExtensionEditor";

type Props = {
  profile: string; extension: WebExtension | null; url: string; setUrl: (value: string) => void;
  run: (fn: () => Promise<void>) => Promise<void>; loadContext: () => Promise<void>; setMessage: (value: string) => void;
  importWeb: (listen: boolean) => void; button: string;
};
export function NovelWebExtensionPanel({ profile, extension, url, setUrl, run, loadContext, setMessage, importWeb, button }: Props) {
  const install = async (value: WebExtension) => {
    if (!window.confirm(`安装网页扩展 ${value.name}？\n允许访问：${value.origins.join("，")}\n来源声明：${value.authorization.statement}\n授权链接：${value.authorization.reference}\n仅可导入你有权使用的内容；声明不代表应用已核验授权。${extension ? "\n将替换当前扩展，但不删除书籍与进度。" : ""}`)) return;
    await novelRequest(profile, "extension-install", { extension: value, confirmed: true });
    await loadContext(); setMessage("网页扩展已安装到当前工作区");
    setUrl(value.id === demo.id ? EXAMPLE_CHAPTER_URL : "");
  };
  return <details className="border-t border-[var(--line)] pt-4">
    <summary className="cursor-pointer text-sm font-medium">网页扩展 · {extension ? extension.name : "未安装"}</summary>
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={button} onClick={() => void run(() => install(demo as WebExtension))}><PackagePlus size={16}/>安装原创示例扩展</button>
        <label className={`${button} cursor-pointer`}><Upload size={16}/>从文件安装<input aria-label="网页扩展 JSON" className="hidden" type="file" accept=".json,.zip,application/json,application/zip" onChange={e => {
          const file = e.target.files?.[0]; e.target.value = "";
          if (file) void run(async () => {
            if (file.size > 256 * 1024) throw new Error("扩展包不能超过 256 KB");
            const form = new FormData(); form.set("profileId", profile); form.set("file", file);
            const response = await novelFetch(`/api/novel/extensions?profileId=${encodeURIComponent(profile)}`, { method: "POST", body: form });
            const value = await response.json(); if (!response.ok) throw new Error(value.error || "扩展包无效");
            await install(value);
          });
        }}/></label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--accent)]">
        <a href="/api/novel/extensions?format=zip" download className="inline-flex items-center gap-1.5 underline underline-offset-4"><Download size={14}/>下载示例 ZIP</a>
        <a href="/api/novel/extensions?format=json" download className="underline underline-offset-4">下载 JSON</a>
        <a href={EXTENSION_RELEASE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4"><ExternalLink size={14}/>GitHub 下载</a>
        <NovelHelpLink section="web-extension">扩展安装与制作</NovelHelpLink>
      </div>
      <NovelExtensionEditor profile={profile} button={button} run={run} install={install}/>
      {extension && <>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--ink-muted)]">
          <span className="break-all">{extension.origins.join(" · ")}</span>
          <a href={extension.authorization.reference} target="_blank" rel="noreferrer" className="underline underline-offset-4">来源授权声明</a>
          <button className={button} onClick={() => void run(async () => {
            await novelRequest(profile, "extension-remove"); await loadContext(); setMessage("网页扩展已移除，已保存的本地书籍未修改");
          })}>移除扩展</button>
        </div>
        <div className="flex flex-wrap gap-2"><input aria-label="授权章节链接" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 basis-56 rounded-lg border p-2"/>
          <button className={button} disabled={!url.trim()} onClick={() => importWeb(false)}>导入网页</button>
          <button className={button} disabled={!url.trim()} onClick={() => importWeb(true)}>导入并阅读</button>
        </div>
      </>}
    </div>
  </details>;
}
