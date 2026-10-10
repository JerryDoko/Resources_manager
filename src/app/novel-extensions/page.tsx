"use client";
import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { NovelWebExtensionPanel } from "@/components/NovelWebExtensionPanel";
import { NovelWorkspace } from "@/components/NovelWorkspace";
import { novelFetch, novelRequest } from "@/lib/novel/client";
import { openNovel } from "@/lib/novel/open-reader";
import type { InstalledWebExtension } from "@/lib/novel/web-extensions";
import { subscribeExtensionChanges } from "@/lib/novel/extension-events";

export default function NovelExtensionsPage() {
  const [profile, setProfile] = useState(""), [extensions, setExtensions] = useState<InstalledWebExtension[]>([]);
  const [url, setUrl] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const loadContext = async () => {
    const response = await novelFetch("/api/novel?action=context"), value = await response.json();
    if (!response.ok) throw new Error(value.error || "无法读取网站扩展");
    setProfile(value.profileId); setExtensions(value.webExtensions || []);
  };
  useEffect(() => {
    const reload = () => void loadContext().catch(error => setMessage(error instanceof Error ? error.message : String(error)));
    reload(); window.addEventListener("focus", reload);
    const unsubscribe = subscribeExtensionChanges(reload);
    return () => { window.removeEventListener("focus", reload); unsubscribe(); };
  }, []);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm disabled:opacity-40";
  return <main className="min-h-dvh bg-[var(--paper)] text-[var(--ink)]">
    <header className="border-b border-[var(--line)] px-4 py-4 sm:px-8"><div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4">
      <button className={button} disabled={busy} onClick={() => window.close()}><Check size={16}/>完成并关闭</button><h1 className="text-xl font-semibold">网站扩展管理</h1>
      <button title="刷新扩展列表" aria-label="刷新扩展列表" className="ml-auto flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)] bg-white disabled:opacity-40" disabled={busy} onClick={() => void run(loadContext)}><RefreshCw size={16}/></button>
    </div></header>
    <section className="mx-auto max-w-4xl px-4 py-6 sm:px-8">
      <p className="mb-5 text-sm text-[var(--ink-muted)]">当前工作区</p>
      <fieldset disabled={busy || !profile} className="disabled:opacity-60">
        <NovelWebExtensionPanel management profile={profile} extensions={extensions} url={url} setUrl={setUrl} run={run} loadContext={loadContext} setMessage={setMessage} button={button} importWeb={listen => void run(async () => {
          setMessage("正在读取网页；如需登录或验证，会弹出网页窗口。关闭网页窗口可取消导入。");
          const result = await novelRequest<{ itemId: string; chapterIds: string[]; title?: string; collectionPath?: string; notice?: string }>(profile, "web", { url });
          setMessage(`${result.notice || "已保存到当前工作区"}${result.collectionPath ? `\n本地文本：${result.collectionPath}` : ""}`);
          if (listen) openNovel({ itemId: result.itemId, title: result.title || "网页小说", chapterId: result.chapterIds[0] });
        })}/>
      </fieldset>
      {(busy || message) && <p role="status" className="mt-4 break-words text-sm text-[var(--ink-muted)]">{message || "正在处理…"}</p>}
    </section>
    <NovelWorkspace/>
  </main>;
}
