"use client";

import { useEffect, useState } from "react";
import {
  FolderPlus,
  FolderOpen,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useLibrary } from "@/lib/store";
import { MEDIA_TYPE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Folder {
  id: string;
  path: string;
  mediaType: string;
  enabled: boolean;
}

export function ImportView() {
  const { mediaType, refresh } = useLibrary();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [path, setPath] = useState("");
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const typeLabel = MEDIA_TYPE_LABELS[mediaType];
  const filteredFolders = folders.filter((f) => f.mediaType === mediaType);

  const load = async () => {
    const res = await fetch("/api/folders", { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      setMsg("加载导入路径失败");
      return;
    }
    const data = await res.json();
    setFolders(data.folders || []);
  };

  useEffect(() => {
    load();
  }, [mediaType]);

  const browseFinder = async () => {
    setMsg("正在打开访达…");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "browse", prompt: "选择媒体文件夹" }),
        signal: AbortSignal.timeout(180000),
      });
      const data = await res.json();
      if (data.path) {
        setPath(data.path);
        setMsg(null);
        setShowAdd(true);
      } else setMsg(null);
    } catch {
      setMsg("打开访达失败");
    }
  };

  const addFolder = async () => {
    if (!path.trim()) return;
    setAdding(true);
    setMsg("正在添加并扫描…");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", path: path.trim(), mediaType }),
        signal: AbortSignal.timeout(600000),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "添加失败");
        return;
      }
      setMsg(
        `已添加：新增 ${data.scan?.added ?? 0} · 系列 ${data.scan?.seriesCreated ?? 0}`
      );
      setPath("");
      setShowAdd(false);
      await load();
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const rescanFolder = async (folder: Folder) => {
    setScanningId(folder.id);
    setMsg(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scan",
          path: folder.path,
          mediaType: folder.mediaType,
        }),
        signal: AbortSignal.timeout(600000),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "扫描失败");
        return;
      }
      setMsg(
        `「${folder.path}」扫描完成：新增 ${data.scan?.added ?? 0} · 更新 ${data.scan?.updated ?? 0}`
      );
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "扫描失败");
    } finally {
      setScanningId(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("从库中移除此导入路径？（不会删除磁盘文件）")) return;
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", id }),
      signal: AbortSignal.timeout(10000),
    });
    await load();
  };

  const scanning = scanningId !== null || adding;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-display text-2xl font-semibold">导入视图</h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {typeLabel} 的已导入路径，可单独重新扫描
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2 text-sm hover:bg-white/80"
        >
          <FolderPlus className="h-4 w-4 text-[var(--accent)]" />
          添加文件夹
        </button>
      </div>

      {showAdd && (
        <section className="glass rounded-2xl p-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/Users/你/Movies"
                className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <button
                type="button"
                onClick={browseFinder}
                disabled={scanning}
                className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2.5 text-sm"
              >
                <FolderOpen className="h-4 w-4" />
                访达
              </button>
              <button
                type="button"
                onClick={addFolder}
                disabled={scanning || !path.trim()}
                className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                添加并扫描
              </button>
            </div>
            <p className="text-xs text-[var(--ink-faint)]">
              将导入为「{typeLabel}」类型
            </p>
          </div>
        </section>
      )}

      {msg && <p className="text-xs text-[var(--accent)]">{msg}</p>}

      <section className="glass rounded-2xl p-5">
        {filteredFolders.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--ink-faint)]">
              尚未添加任何{typeLabel}导入路径
            </p>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-3 text-sm text-[var(--accent)] underline"
            >
              添加第一个文件夹
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {filteredFolders.map((f) => {
              const busy = scanningId === f.id;
              return (
                <li
                  key={f.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="break-all text-sm font-medium leading-snug"
                      title={f.path}
                    >
                      {f.path}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => rescanFolder(f)}
                    disabled={scanning}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs transition",
                      busy
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "bg-white/50 hover:bg-white/80"
                    )}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
                    重新扫描
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    disabled={scanning}
                    className="shrink-0 rounded-lg p-2 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                    title="移除导入路径"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
