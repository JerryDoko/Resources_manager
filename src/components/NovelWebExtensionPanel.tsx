"use client";
import { useState } from "react";
import { Download, ExternalLink, PackagePlus, Settings2, Trash2, Upload } from "lucide-react";
import demo from "@/lib/novel/extension-demo.json";
import { EXAMPLE_CHAPTER_URL, EXTENSION_RELEASE_URL } from "@/lib/novel/extension-downloads";
import type { InstalledWebExtension, WebExtension } from "@/lib/novel/web-extensions";
import { novelFetch, novelRequest } from "@/lib/novel/client";
import { publishExtensionChange } from "@/lib/novel/extension-events";
import { NovelHelpLink } from "./NovelHelpLink";
import { NovelExtensionEditor } from "./NovelExtensionEditor";

type Props = {
  profile: string; extensions: InstalledWebExtension[]; url: string; setUrl: (value: string) => void;
  run: (fn: () => Promise<void>) => Promise<void>; loadContext: () => Promise<void>; setMessage: (value: string) => void;
  importWeb: (listen: boolean) => void; button: string; management?: boolean;
};
export function NovelWebExtensionPanel({ profile, extensions, url, setUrl, run, loadContext, setMessage, importWeb, button, management = false }: Props) {
  const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>({});
  const install = async (value: WebExtension) => {
    const existing = extensions.find(entry => entry.extension.id === value.id);
    if (!window.confirm(`${existing ? "更新" : "安装"}网页扩展 ${value.name}？\n允许访问：${value.origins.join("，")}\n来源声明：${value.authorization.statement}\n来源链接：${value.authorization.reference}\n${value.transport === "browser" ? "读取方式：隔离的内置浏览器，会运行该网站自己的网页脚本及 Cloudflare 验证资源；遇到验证码需自行完成。\n" : ""}${value.authorization.basis === "unverified" ? "来源授权未核实；应用不将其标为已获许可。\n" : ""}其他扩展、书籍和进度保持不变。${existing ? "原有启用状态保持不变。" : "新扩展默认启用。"}`)) return;
    await novelRequest(profile, "extension-install", { extension: value, confirmed: true });
    publishExtensionChange(profile);
    await loadContext(); setMessage("网页扩展已保存到当前工作区，其他扩展未修改");
    if (value.id === demo.id && !url.trim()) setUrl(EXAMPLE_CHAPTER_URL);
  };
  const enabled = extensions.filter(entry => entry.enabled);
  let matches: InstalledWebExtension[] = [], supported: InstalledWebExtension[] = [];
  let invalid = false;
  if (url.trim()) {
    try {
      const target = new URL(url.trim()); invalid = target.protocol !== "https:" || !!target.username || !!target.password;
      supported = extensions.filter(entry => entry.extension.origins.includes(target.origin));
      matches = supported.filter(entry => entry.enabled);
    } catch { invalid = true; }
  }
  const matchLabel = !url.trim() ? "" : invalid ? "请输入完整的 HTTPS 章节链接" : matches.length === 1 ? `匹配扩展：${matches[0].extension.name}` : matches.length > 1 ? "多个扩展匹配，请只勾选一个" : supported.length ? "对应扩展已停用，请勾选启用" : "尚未安装此网站的扩展";
  const matched = matches.length === 1 ? matches[0].extension : undefined;
  const browserReading = matched?.transport === "browser" || (matched?.transport === "json" && matched.json.browser);
  const content = <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <button className={button} onClick={() => void run(() => install(demo as WebExtension))}><PackagePlus size={16}/>安装原创示例扩展</button>
      <label className={`${button} cursor-pointer`}><Upload size={16}/>从文件安装<input aria-label="网页扩展 JSON" className="hidden" type="file" multiple accept=".json,.zip,application/json,application/zip" onChange={e => {
        const files = Array.from(e.target.files || []); e.target.value = "";
        if (files.length) void run(async () => {
          for (const file of files) {
            if (file.size > 256 * 1024) throw new Error("扩展包不能超过 256 KB");
            const form = new FormData(); form.set("profileId", profile); form.set("file", file);
            const response = await novelFetch(`/api/novel/extensions?profileId=${encodeURIComponent(profile)}`, { method: "POST", body: form });
            const value = await response.json(); if (!response.ok) throw new Error(value.error || "扩展包无效");
            await install(value);
          }
        });
      }}/></label>
      {!management && <a className={button} href="/novel-extensions" target="_blank" rel="noreferrer"><Settings2 size={16}/>管理网站扩展</a>}
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[var(--accent)]">
      <a href="/api/novel/extensions?format=zip" download className="inline-flex items-center gap-1.5 underline underline-offset-4"><Download size={14}/>下载示例 ZIP</a>
      <a href="/api/novel/extensions?format=json" download className="underline underline-offset-4">下载 JSON</a>
      <a href={EXTENSION_RELEASE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline underline-offset-4"><ExternalLink size={14}/>GitHub 下载</a>
      <NovelHelpLink section="web-extension">扩展安装与制作</NovelHelpLink>
    </div>
    <div>
      <h3 className="mb-2 text-sm font-medium">已安装网站 · {extensions.length}<span className="ml-3 text-xs font-normal text-[var(--ink-muted)]">已启用 {enabled.length}</span></h3>
      {!extensions.length && <p className="py-3 text-sm text-[var(--ink-muted)]">尚未安装网站扩展</p>}
      <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{extensions.map(({ extension, enabled: active }) => <li key={extension.id} className="flex items-start gap-3 py-3">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" aria-label={`启用 ${extension.name}`} checked={pendingEnabled[extension.id] ?? active} onChange={e => {
          const checked = e.target.checked;
          setPendingEnabled(values => ({ ...values, [extension.id]: checked }));
          void run(async () => {
            try { await novelRequest(profile, "extension-enabled", { id: extension.id, enabled: checked }); publishExtensionChange(profile); await loadContext(); setMessage(`${extension.name}已${checked ? "启用" : "停用"}`); }
            finally { setPendingEnabled(values => { const next = { ...values }; delete next[extension.id]; return next; }); }
          });
        }}/>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="break-words text-sm font-medium">{extension.name}</span><span className="text-xs text-[var(--ink-muted)]">v{extension.version} · {active ? "已启用" : "已停用"}</span></div>
          <div className="mt-1 break-all text-xs leading-5 text-[var(--ink-muted)]">{extension.origins.join(" · ")}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--ink-muted)]"><span>{extension.transport === "browser" ? "内置浏览器读取" : extension.transport === "json" ? (extension.json.browser ? "内置浏览器接口读取" : "公开接口读取") : "直接读取"}</span>{extension.authorization.basis === "unverified" && <span>来源授权未核实</span>}<a href={extension.authorization.reference} target="_blank" rel="noreferrer" className="underline underline-offset-4">来源声明</a></div>
        </div>
        <button aria-label={`移除 ${extension.name}`} title="移除扩展" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--ink-muted)] hover:bg-red-50 hover:text-red-600" onClick={() => void run(async () => {
          if (!window.confirm(`移除 ${extension.name}？其他扩展、已保存章节和阅读进度保持不变。`)) return;
          await novelRequest(profile, "extension-remove", { id: extension.id }); publishExtensionChange(profile); await loadContext(); setMessage("已移除此扩展，其他扩展与本地书籍保持不变");
        })}><Trash2 size={16}/></button>
      </li>)}</ul>
    </div>
    <NovelExtensionEditor profile={profile} button={button} run={run} install={install}/>
    {!!extensions.length && <div className="space-y-2 border-t border-[var(--line)] pt-4">
      <div className="flex flex-wrap gap-2"><input aria-label="授权章节链接" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 basis-56 rounded-lg border border-[var(--line)] bg-white p-2 text-sm"/>
        <button className={button} disabled={invalid || matches.length !== 1} onClick={() => importWeb(false)}>导入网页</button>
        <button className={button} disabled={invalid || matches.length !== 1} onClick={() => importWeb(true)}>导入并阅读</button>
        {browserReading && <button className={button} disabled={invalid} onClick={() => void run(async () => {
          await novelRequest(profile, "web-open", { url });
          setMessage("已打开网页窗口。登录或查看完成后关闭窗口，再点击导入网页。");
        })}><ExternalLink size={16}/>打开网页</button>}
      </div>
      {matchLabel && <p className="break-words text-xs text-[var(--ink-muted)]" aria-live="polite">{matchLabel}</p>}
    </div>}
  </div>;
  if (management) return content;
  return <details className="border-t border-[var(--line)] pt-4">
    <summary className="cursor-pointer text-sm font-medium">网页扩展 · {extensions.length === 0 ? "未安装" : extensions.length === 1 ? extensions[0].extension.name : `${enabled.length} / ${extensions.length} 已启用`}</summary>
    <div className="mt-3">{content}</div>
  </details>;
}
