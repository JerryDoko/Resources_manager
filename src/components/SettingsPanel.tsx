"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  Copy,
  Download,
  FolderOpen,
  FolderPlus,
  Globe,
  ImageIcon,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useLibrary } from "@/lib/store";
import {
  MEDIA_TYPE_LABELS,
  type AiPermissionLevel,
  type MediaType,
} from "@/lib/types";
import { ShortcutSettings } from "@/components/ShortcutSettings";
import { cn } from "@/lib/utils";

interface StoragePaths {
  rootDataDir: string;
  activeProfileName: string;
  activeProfileDir: string;
  libraryDb: string;
  thumbnailsDir: string;
}

interface Folder {
  id: string;
  path: string;
  mediaType: string;
  enabled: boolean;
}

export function SettingsPanel() {
  const { showSettings, setShowSettings, refresh, mediaType, uiScale, setUiScale } =
    useLibrary();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [path, setPath] = useState("");
  const [type, setType] = useState<MediaType>(mediaType);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [storagePaths, setStoragePaths] = useState<StoragePaths | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    remoteEnabled: false,
    remoteSubdomain: "resources",
    aiEnabled: false,
    aiPermissionLevel: "read" as AiPermissionLevel,
    aiApiBaseUrl: "http://127.0.0.1:11434/v1",
    aiVisionModel: "",
    aiApiKey: "",
    aiControlToken: "",
  });
  const [aiSaving, setAiSaving] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const load = async () => {
    const [fRes, sRes, pRes] = await Promise.all([
      fetch("/api/folders", { signal: AbortSignal.timeout(10000) }),
      fetch("/api/settings", { signal: AbortSignal.timeout(10000) }),
      fetch("/api/system/paths", { signal: AbortSignal.timeout(10000) }),
    ]);
    const fData = await fRes.json();
    const sData = await sRes.json();
    setActiveProfileId(fData.activeProfileId || null);
    if (pRes.ok) setStoragePaths(await pRes.json());
    setFolders(fData.folders || []);
    setSettings({
      remoteEnabled: !!sData.remoteEnabled,
      remoteSubdomain: sData.remoteSubdomain || "resources",
      aiEnabled: !!sData.aiEnabled,
      aiPermissionLevel: ["read", "reversible", "dangerous"].includes(
        sData.aiPermissionLevel
      )
        ? sData.aiPermissionLevel
        : "read",
      aiApiBaseUrl: sData.aiApiBaseUrl || "http://127.0.0.1:11434/v1",
      aiVisionModel: sData.aiVisionModel || "",
      aiApiKey: sData.aiApiKey || "",
      aiControlToken: sData.aiControlToken || "",
    });
  };

  useEffect(() => {
    if (showSettings) load();
  }, [showSettings]);

  if (!showSettings) return null;

  const browseFinder = async () => {
    setScanMsg("正在打开文件夹选择器…");
    try {
      if (window.rmDesktop?.chooseFolder) {
        const selectedPath = await window.rmDesktop.chooseFolder("选择媒体文件夹");
        if (!selectedPath) {
          setScanMsg(null);
          return;
        }
        setPath(selectedPath);
        setScanMsg(`已选择：${selectedPath}`);
        return;
      }
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "browse",
          prompt: "选择媒体文件夹",
          profileId: activeProfileId,
        }),
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
      setScanMsg("打开文件夹选择器失败，请手动输入路径");
    }
  };

  const regenThumbs = async () => {
    setScanning(true);
    setScanMsg("正在生成缩略图…");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "thumbnails", profileId: activeProfileId }),
        signal: AbortSignal.timeout(300000),
      });
      const data = await res.json();
      setScanMsg(`缩略图完成：系列 ${data.series} · 条目 ${data.items}`);
      await refresh();
    } finally {
      setScanning(false);
    }
  };

  const parseJsonSafe = async (res: Response) => {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        res.ok
          ? "服务器返回了无法解析的响应"
          : `请求失败 (${res.status})，可能是扫描超时或服务异常`
      );
    }
  };

  const addFolder = async () => {
    if (!path.trim()) return;
    setScanning(true);
    setScanMsg("正在递归扫描子文件夹…");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          path: path.trim(),
          mediaType: type,
          profileId: activeProfileId,
        }),
        signal: AbortSignal.timeout(600000),
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        setScanMsg(data.error || "添加失败");
        return;
      }
      const errHint =
        data.scan?.errors?.length > 0
          ? ` · ${data.scan.errors.slice(0, 2).join("；")}${
              data.scan.errors.length > 2 ? "…" : ""
            }`
          : "";
      if (data.scan?.scanned > 0 && data.scan?.added === 0 && data.scan?.updated === 0) {
        setScanMsg(
          `未导入新内容（扫描到 ${data.scan.scanned} 个文件）。${errHint || "可能已在库中，或类型与文件扩展名不匹配。"}`
        );
      } else {
        setScanMsg(
          `完成：扫描 ${data.scan.scanned} · 新增 ${data.scan.added} · 系列 ${data.scan.seriesCreated}${errHint}`
        );
      }
      if (data.scan?.added > 0) setPath("");
      await load();
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setScanMsg(
        /aborted|timeout|TimeoutError/i.test(msg)
          ? "扫描超时：文件夹太大。请稍后再点「全库重新扫描」，或拆成更小的目录添加"
          : `添加失败：${msg}`
      );
    } finally {
      setScanning(false);
    }
  };

  const rescan = async () => {
    setScanning(true);
    setScanMsg("全库扫描中（含子文件夹）…");
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", profileId: activeProfileId }),
        signal: AbortSignal.timeout(600000),
      });
      const data = await parseJsonSafe(res);
      setScanMsg(
        `完成：扫描 ${data.scan.scanned} · 新增 ${data.scan.added} · 系列 ${data.scan.seriesCreated}`
      );
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setScanMsg(
        /aborted|timeout|TimeoutError/i.test(msg)
          ? "全库扫描超时，请稍后重试或缩小库目录"
          : `扫描失败：${msg}`
      );
    } finally {
      setScanning(false);
    }
  };

  const remove = async (id: string) => {
    await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", id, profileId: activeProfileId }),
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

  const saveAiSettings = async () => {
    setAiSaving(true);
    setAiMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEnabled: settings.aiEnabled,
          aiPermissionLevel: settings.aiPermissionLevel,
          aiApiBaseUrl: settings.aiApiBaseUrl.trim(),
          aiVisionModel: settings.aiVisionModel.trim(),
          aiApiKey: settings.aiApiKey.trim(),
          aiControlToken: settings.aiControlToken,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setSettings((current) => ({
        ...current,
        aiControlToken: data.aiControlToken || current.aiControlToken,
      }));
      setAiMessage("AI 控制设置已保存");
      window.dispatchEvent(new Event("rm:ai-settings-updated"));
    } catch (error) {
      setAiMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAiSaving(false);
    }
  };

  const regenerateAiToken = () => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    setSettings((current) => ({ ...current, aiControlToken: token }));
    setAiMessage("已生成新令牌，请保存设置后使用");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-up">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--line)] bg-white px-5 py-4">
          <div>
            <h2 className="text-display text-xl font-semibold">设置</h2>
            <p className="text-xs text-[var(--ink-muted)]">
              本地库路径 · AI 控制 · 快捷键 · 备份恢复
            </p>
          </div>
          <button
            onClick={() => setShowSettings(false)}
            className="rounded-lg p-2 text-[var(--ink-muted)] hover:bg-[var(--bg)]"
            aria-label="关闭设置"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5 scrollbar-thin">
          <section className="rounded-2xl border border-[var(--line)] bg-[#f7f9f8] p-4">
            <h3 className="mb-3 text-sm font-semibold">界面大小</h3>
            <p className="mb-3 text-xs text-[var(--ink-muted)]">
              调整整体界面缩放比例，立即生效并保存到本地设置。
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "较小", value: 0.85 },
                { label: "默认", value: 1 },
                { label: "较大", value: 1.1 },
                { label: "最大", value: 1.25 },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setUiScale(opt.value)}
                  className={cn(
                    "rounded-xl border px-4 py-2 text-sm transition",
                    Math.abs(uiScale - opt.value) < 0.01
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--line)] hover:bg-white/50"
                  )}
                >
                  {opt.label} ({Math.round(opt.value * 100)}%)
                </button>
              ))}
            </div>
          </section>

          {storagePaths && (
            <section className="rounded-2xl border border-[var(--line)] bg-[#f7f9f8] p-4">
              <h3 className="mb-3 text-sm font-semibold">数据存储位置</h3>
              <dl className="space-y-2 text-xs">
                <div>
                  <dt className="text-[var(--ink-faint)]">当前配置</dt>
                  <dd className="mt-0.5 font-medium">{storagePaths.activeProfileName}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-faint)]">配置目录</dt>
                  <dd className="mt-0.5 break-all font-mono text-[11px]">
                    {storagePaths.activeProfileDir}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-faint)]">数据库</dt>
                  <dd className="mt-0.5 break-all font-mono text-[11px]">
                    {storagePaths.libraryDb}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-faint)]">缩略图</dt>
                  <dd className="mt-0.5 break-all font-mono text-[11px]">
                    {storagePaths.thumbnailsDir}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-faint)]">根目录</dt>
                  <dd className="mt-0.5 break-all font-mono text-[11px]">
                    {storagePaths.rootDataDir}
                  </dd>
                </div>
              </dl>
            </section>
          )}

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
                  placeholder="输入文件夹路径，或点击右侧选择"
                  className="min-w-0 flex-1 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <button
                  type="button"
                  onClick={browseFinder}
                  disabled={scanning}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                  title="选择文件夹"
                >
                  <FolderOpen className="h-4 w-4" />
                  选择
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

          <section className="rounded-lg border border-[var(--line)] bg-[#f7f9f8] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Bot className="h-4 w-4 text-[var(--accent)]" />
                  AI 控制
                </h3>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">
                  提供本地控制接口。识图时，缩小后的图片会发送到你填写的视觉模型服务。
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.aiEnabled}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      aiEnabled: event.target.checked,
                    }))
                  }
                />
                启用接口
              </label>
            </div>

            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
                最高权限等级
              </p>
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--line)] bg-white p-1">
                {([
                  ["read", "读取级", "搜索、查看信息"],
                  ["reversible", "可恢复级", "评分、排序、标签"],
                  ["dangerous", "危险级", "删除、重置进度"],
                ] as const).map(([level, label, description]) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      if (
                        level !== "dangerous" ||
                        window.confirm("危险级允许 AI 发起删除和重置进度请求，执行前仍会弹窗确认。是否继续？")
                      ) {
                        setSettings((current) => ({
                          ...current,
                          aiPermissionLevel: level,
                        }));
                      }
                    }}
                    className={cn(
                      "min-w-0 rounded-md px-2 py-2 text-center transition",
                      settings.aiPermissionLevel === level
                        ? "bg-[var(--accent)] text-white"
                        : "text-[var(--ink-muted)] hover:bg-[var(--bg)]"
                    )}
                  >
                    <span className="block text-xs font-medium">{label}</span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-[10px]",
                        settings.aiPermissionLevel === level
                          ? "text-white/70"
                          : "text-[var(--ink-faint)]"
                      )}
                    >
                      {description}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
                危险动作只会进入待确认队列，必须在本应用弹窗中批准。
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[var(--ink-muted)] sm:col-span-2">
                AI 服务地址
                <input
                  value={settings.aiApiBaseUrl}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      aiApiBaseUrl: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="http://127.0.0.1:11434/v1"
                />
              </label>
              <label className="text-xs text-[var(--ink-muted)]">
                视觉模型
                <input
                  value={settings.aiVisionModel}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      aiVisionModel: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="填写支持图片的模型名称"
                />
              </label>
              <label className="text-xs text-[var(--ink-muted)]">
                API Key
                <input
                  type="password"
                  value={settings.aiApiKey}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      aiApiKey: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="本地服务通常可留空"
                  autoComplete="off"
                />
              </label>
            </div>

            <div className="mt-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs text-[var(--ink-muted)]">
                <KeyRound className="h-3.5 w-3.5" />
                AI 控制令牌
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={settings.aiControlToken}
                  className="min-w-0 flex-1 rounded-md border border-[var(--line)] bg-white px-3 py-2 font-mono text-[11px] text-[var(--ink-muted)]"
                  placeholder="启用并保存后自动生成"
                />
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(settings.aiControlToken)}
                  disabled={!settings.aiControlToken}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-muted)] hover:text-[var(--accent)] disabled:opacity-40"
                  title="复制令牌"
                  aria-label="复制 AI 控制令牌"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={regenerateAiToken}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-white text-[var(--ink-muted)] hover:text-[var(--accent)]"
                  title="生成新令牌"
                  aria-label="生成新的 AI 控制令牌"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-3 rounded-md border border-[var(--line)] bg-white px-3 py-3">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--ink)]">GPT / Codex 插件</p>
                <p className="mt-1 text-[11px] leading-5 text-[var(--ink-muted)]">
                  插件会自动发现本机端口和控制令牌，无需填写连接地址。保持 Resources Manager
                  运行，并在 GPT / Codex 中启用 Resources Manager 插件即可。
                </p>
                <p className="mt-1 text-[11px] text-[var(--accent)]">
                  {settings.aiEnabled && settings.aiControlToken
                    ? "本机插件桥接已就绪"
                    : "启用接口并保存后即可连接"}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-[var(--accent)]">{aiMessage}</p>
              <button
                type="button"
                onClick={() => void saveAiSettings()}
                disabled={aiSaving}
                className="shrink-0 rounded-md bg-[var(--ink)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {aiSaving ? "保存中…" : "保存 AI 设置"}
              </button>
            </div>
          </section>

          <section className="flex items-center justify-between gap-4 border-y border-[var(--line)] py-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">软件更新</h3>
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("rm:check-for-updates"))}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              检查更新
            </button>
          </section>

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
        </div>
      </div>
    </div>
  );
}
