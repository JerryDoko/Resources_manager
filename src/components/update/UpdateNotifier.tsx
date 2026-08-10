"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, X } from "lucide-react";

interface UpdateAsset {
  name: string;
  url: string;
  size: number;
}

interface UpdateInfo {
  currentVersion: string;
  latestVersion?: string;
  tagName?: string;
  updateAvailable: boolean;
  title?: string;
  url?: string;
  publishedAt?: string | null;
  notes?: string;
  assets?: UpdateAsset[];
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "";
  const mb = size / 1024 / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

export function UpdateNotifier() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/update/check", {
          signal: AbortSignal.timeout(12000),
        });
        const data = (await res.json()) as UpdateInfo;
        if (cancelled || !data.updateAvailable || !data.latestVersion) return;

        const ignored = localStorage.getItem("rm-ignored-update-version");
        if (ignored === data.latestVersion) return;

        setUpdate(data);
        setOpen(true);
      } catch {
        /* 离线或 GitHub 不可达时静默跳过 */
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const primaryAsset = useMemo(() => {
    const assets = update?.assets || [];
    return (
      assets.find((asset) => /\.dmg$/i.test(asset.name)) ||
      assets.find((asset) => /\.zip$/i.test(asset.name)) ||
      assets[0]
    );
  }, [update]);

  if (!open || !update) return null;

  const latestLabel = update.tagName || `v${update.latestVersion}`;

  return (
    <div className="fixed right-4 top-4 z-[260] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--line)] bg-[#f7f9f8]/95 shadow-2xl backdrop-blur-xl animate-fade-up">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 rounded-xl bg-[var(--accent-soft)] p-2 text-[var(--accent)]">
          <Download className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">发现新版本</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
            当前 {update.currentVersion}，可更新到 {latestLabel}
          </p>
          {update.title && (
            <p className="mt-2 truncate text-xs font-medium text-[var(--ink)]">
              {update.title}
            </p>
          )}
          {primaryAsset && (
            <p className="mt-1 truncate text-[11px] text-[var(--ink-faint)]">
              {primaryAsset.name}
              {formatBytes(primaryAsset.size) ? ` · ${formatBytes(primaryAsset.size)}` : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-black/5 hover:text-[var(--ink)]"
          aria-label="关闭更新提醒"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--line)] bg-white/45 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            const url = primaryAsset?.url || update.url;
            if (url) window.open(url, "_blank", "noopener,noreferrer");
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white hover:brightness-110"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          下载更新
        </button>
        <button
          type="button"
          onClick={() => {
            if (update.latestVersion) {
              localStorage.setItem("rm-ignored-update-version", update.latestVersion);
            }
            setOpen(false);
          }}
          className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--ink-muted)] hover:text-[var(--ink)]"
        >
          忽略此版
        </button>
      </div>
    </div>
  );
}
