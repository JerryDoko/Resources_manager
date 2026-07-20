"use client";

import { useEffect, useState } from "react";
import { X, FolderPlus, RefreshCw, Download, Upload, Trash2, Globe, FolderOpen, ImageIcon } from "lucide-react";
import { useLibrary } from "@/lib/store";
import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/types";
import { ShortcutSettings } from "@/components/ShortcutSettings";

interface Folder {
  id: string;
  path: string;
  mediaType: string;
  enabled: boolean;
}

export function SettingsPanel() {
  const { showSettings, setShowSettings, refresh, mediaType } = useLibrary();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [path, setPath] = useState("");
  const [type, setType] = useState<MediaType>(mediaType);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    remoteEnabled: false,
    remoteSubdomain: "resources",
  });

  const load = async () => {
    const [fRes, sRes] = await Promise.all([
      fetch("/api/folders", { signal: AbortSignal.timeout(10000) }),
      fetch("/api/settings", { signal: AbortSignal.timeout(10000) }),
    ]);
    const fData = await fRes.json();
    const sData = await sRes.json();
    setFolders(fData.folders || []);
    setSettings({
      remoteEnabled: !!sData.remoteEnabled,
      remoteSubdomain: sData.remoteSubdomain || "resources",
    });
  };

  useEffect(() => {
    if (showSettings) load();
  }, [showSettings]);

  if (!showSettings) return null;

  const browseFinder = async () => {
    setScanMsg("正在打开访达…");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "browse", prompt: "选择媒体文件夹" }),
        signal: AbortSignal.timeout(180000),
      });
      const data = await res.json();
      if (data.error) {
        setScanMsg(data.error);
        return;
      }
      if (!data.path) {
        setScanMsg(null);
        return;
      }
      setPath(data.path);
      setScanMsg(`已选择：${data.path}`);
    } catch {
      setScanMsg("打开访达失败，请手动输入路径");
    }
  };

  const regenThumbs = async () => {
    setScanning(true);
    setScanMsg("正在生成缩略图…");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "thumbnails" }),
        signal: AbortSignal.timeout(300000),
      });
      const data = await res.json();
      setScanMsg(`缩略图完成：系列 ${data.series} · 条目 ${data.items}`);
      await refresh();
    } finally {
      setScanning(false);
    }
  };

  const addFolder = async () => {
    if (!path.trim()) return;
    setScanning(true);
    setScanMsg("正在扫描…");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", path: path.trim(), mediaType: type }),
        signal: AbortSignal.timeout(120000),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanMsg(data.error || "添加失败");
        return;
      }
      setScanMsg(
        `完成：扫描 ${data.scan.scanned} · 新增 ${data.scan.added} · 系列 ${data.scan.seriesCreated}`
      );
      setPath("");
      await load();
      await refresh();
    } finally {
      setScanning(false);
    }
  };

  const rescan = async () => {
    setScanning(true);
    setScanMsg("全库扫描中…");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
        signal: AbortSignal.timeout(300000),
      });
      const data = await res.json();
      setScanMsg(
        `完成：扫描 ${data.scan.scanned} · 新增 ${data.scan.added} · 系列 ${data.scan.seriesCreated}`
      );
      await refresh();
    } finally {
      setScanning(false);
    }
  };

  const remove = async (id: string) => {
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", id }),
      signal: AbortSignal.timeout(10000),
    });
    await load();
  };

  const saveRemote = async () => {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
      signal: AbortSignal.timeout(10000),
    });
    setScanMsg("设置已保存");
  };

  const backup = async () => {
    const res = await fetch("/api/settings?backup=1", {
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resources-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const restore = async (file: File) => {
    const text = await file.text();
    const data = JSON.parse(text);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: data }),
      signal: AbortSignal.timeout(30000),
    });
    setScanMsg("备份已恢复");
    await load();
    await refresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-fade-up">
      <div className="panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <div>
            <h2 className="text-display text-xl font-semibold">设置</h2>
            <p className="text-xs text-[var(--ink-muted)]">
              本地库路径 · 快捷键 · 远程访问 · 备份恢复
            </p>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="rounded-lg p-2 text-[var(--ink-muted)] hover:bg-[var(--bg)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 scrollbar-thin">
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FolderPlus className="h-4 w-4 text-[var(--accent)]" />
              添加媒体文件夹
            </h3>
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/Users/你/Movies 或点击右侧从访达选择"
                  className="min-w-0 flex-1 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={browseFinder}
                  disabled={scanning}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                  title="在访达中选择文件夹"
                >
                  <FolderOpen className="h-4 w-4" />
                  访达
                </button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as MediaType)}
                  className="rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm"
                >
                  {Object.entries(MEDIA_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button
                  onClick={addFolder}
                  disabled={scanning || !path.trim()}
                  className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  添加并扫描
                </button>
              </div>
            </div>
            {scanMsg && (
              <p className="mt-2 text-xs text-[var(--accent)]">{scanMsg}</p>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">已添加文件夹</h3>
              <div className="flex gap-2">
                <button
                  onClick={regenThumbs}
                  disabled={scanning}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] hover:bg-[var(--bg)]"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  重新生成缩略图
                </button>
                <button
                  onClick={rescan}
                  disabled={scanning}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--ink-muted)] hover:bg-[var(--bg)]"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
                  全库重新扫描
                </button>
              </div>
            </div>
            {folders.length === 0 ? (
              <p className="text-sm text-[var(--ink-faint)]">尚未添加文件夹</p>
            ) : (
              <ul className="space-y-2">
                {folders.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.path}</p>
                      <p className="text-xs text-[var(--ink-faint)]">
                        {MEDIA_TYPE_LABELS[f.mediaType as MediaType] || f.mediaType}
                      </p>
                    </div>
                    <button
                      onClick={() => remove(f.id)}
                      className="rounded-lg p-2 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ShortcutSettings />

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Globe className="h-4 w-4 text-[var(--accent)]" />
              远程访问（Mobile Web）
            </h3>
            <p className="mb-3 text-xs text-[var(--ink-muted)]">
              开启后将预留隧道配置。当前版本在本机通过局域网 IP:端口访问；完整
              your-name.resourcesmanager.app 隧道可在后续接入 Cloudflare / frp。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.remoteEnabled}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, remoteEnabled: e.target.checked }))
                  }
                />
                启用远程访问
              </label>
              <input
                value={settings.remoteSubdomain}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, remoteSubdomain: e.target.value }))
                }
                className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm"
                placeholder="子域名"
              />
              <span className="text-xs text-[var(--ink-faint)]">.resourcesmanager.app</span>
              <button
                onClick={saveRemote}
                className="rounded-lg bg-[var(--ink)] px-3 py-1.5 text-xs text-white"
              >
                保存
              </button>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">备份与恢复</h3>
            <p className="mb-3 text-xs text-[var(--ink-muted)]">
              一键导出评分、标签、进度与设置。本地 SQLite，无云同步、无内容遥测。
            </p>
            <div className="flex gap-2">
              <button
                onClick={backup}
                className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm hover:bg-[var(--bg)]"
              >
                <Download className="h-4 w-4" />
                导出备份
              </button>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--line)] px-4 py-2.5 text-sm hover:bg-[var(--bg)]">
                <Upload className="h-4 w-4" />
                恢复备份
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) restore(f);
                  }}
                />
              </label>
            </div>
          </section>

          <section className="rounded-xl bg-[var(--accent-soft)]/50 p-4 text-xs leading-relaxed text-[var(--ink-muted)]">
            <p className="font-medium text-[var(--accent)]">已实现能力</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>六种媒体类型统一库 · 标题栏切换</li>
              <li>访达选择文件夹 · 扫描时自动生成缩略图</li>
              <li>文件夹扫描 · [作者] 标题解析 · 话数自动归入系列</li>
              <li>系列详情页 · 标签/评分 · 阅读观看进度</li>
              <li>漫画/条漫阅读器（含 zip/cbz）· 视频/音乐/照片/小说</li>
              <li>SQLite 本地存储 · 备份恢复</li>
            </ul>
            <p className="mt-3 font-medium text-[var(--accent)]">规划中</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>拍摄日历 / GPS 地图 · 重复检测 · 本地 AI 气泡翻译</li>
              <li>一键远程隧道 · 视频帧缩略图</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
