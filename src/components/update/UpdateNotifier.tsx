"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, ExternalLink, RefreshCw, X } from "lucide-react";

const GITHUB_RELEASE_URL =
  "https://api.github.com/repos/JerryDoko/Resources_manager/releases/latest";

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
  error?: string;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string | null;
  html_url?: string;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  assets?: Array<{ name: string; browser_download_url: string; size: number }>;
}

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, "").split(/[+-]/)[0];
}

function compareVersions(a: string, b: string) {
  const pa = normalizeVersion(a).split(".").map((part) => Number(part) || 0);
  const pb = normalizeVersion(b).split(".").map((part) => Number(part) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (pa[index] || 0) - (pb[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function checkDirectly(currentVersion: string): Promise<UpdateInfo> {
  const response = await fetch(GITHUB_RELEASE_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`GitHub 请求失败 (${response.status})`);

  const release = (await response.json()) as GitHubRelease;
  const latestVersion = normalizeVersion(release.tag_name || "");
  if (!latestVersion) throw new Error("GitHub Release 缺少版本号");

  return {
    currentVersion,
    latestVersion,
    tagName: release.tag_name,
    updateAvailable:
      !release.draft &&
      !release.prerelease &&
      compareVersions(latestVersion, currentVersion) > 0,
    title: release.name || release.tag_name,
    url: release.html_url,
    publishedAt: release.published_at,
    assets: (release.assets || []).map((asset) => ({
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
    })),
  };
}

function formatBytes(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "";
  const mb = size / 1024 / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
}

export function UpdateNotifier() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  const checkForUpdate = useCallback(async (manual = false) => {
    if (checkingRef.current) return false;
    checkingRef.current = true;
    setChecking(true);
    if (manual) {
      setUpdate(null);
      setOpen(true);
    }
    try {
      const response = await fetch(`/api/update/check?t=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      let data = (await response.json()) as UpdateInfo;

      if (!response.ok || data.error || !data.latestVersion) {
        data = await checkDirectly(data.currentVersion || "0.0.0");
      }

      const ignored = localStorage.getItem("rm-ignored-update-version");
      if (!manual && (!data.updateAvailable || ignored === data.latestVersion)) return true;

      setUpdate(data);
      setOpen(true);
      return true;
    } catch (error) {
      if (!manual) return false;
      setUpdate({
        currentVersion: "",
        updateAvailable: false,
        error: error instanceof Error ? error.message : "无法连接 GitHub",
      });
      setOpen(true);
      return false;
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let retryTimer: number | undefined;
    const initialTimer = window.setTimeout(async () => {
      const checked = await checkForUpdate(false);
      if (!checked) {
        retryTimer = window.setTimeout(() => void checkForUpdate(false), 45000);
      }
    }, 2500);
    const handleManualCheck = () => void checkForUpdate(true);
    window.addEventListener("rm:check-for-updates", handleManualCheck);

    return () => {
      window.clearTimeout(initialTimer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      window.removeEventListener("rm:check-for-updates", handleManualCheck);
    };
  }, [checkForUpdate]);

  const primaryAsset = useMemo(() => {
    const assets = update?.assets || [];
    return (
      assets.find((asset) => /\.dmg$/i.test(asset.name)) ||
      assets.find((asset) => /\.zip$/i.test(asset.name)) ||
      assets[0]
    );
  }, [update]);

  if (!open || (!update && !checking)) return null;

  if (!update) {
    return (
      <div className="fixed right-4 top-4 z-[260] flex w-[min(320px,calc(100vw-2rem))] items-center gap-3 rounded-2xl border border-[var(--line)] bg-[#f7f9f8]/95 p-4 shadow-2xl backdrop-blur-xl animate-fade-up">
        <span className="rounded-xl bg-[var(--accent-soft)] p-2 text-[var(--accent)]">
          <RefreshCw className="h-4 w-4 animate-spin" />
        </span>
        <p className="text-sm font-semibold text-[var(--ink)]">正在检查更新</p>
      </div>
    );
  }

  const latestLabel = update.tagName || `v${update.latestVersion}`;
  const failed = !!update.error;
  const isCurrent = !failed && !update.updateAvailable;

  return (
    <div className="fixed right-4 top-4 z-[260] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--line)] bg-[#f7f9f8]/95 shadow-2xl backdrop-blur-xl animate-fade-up">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 rounded-xl bg-[var(--accent-soft)] p-2 text-[var(--accent)]">
          {failed ? (
            <AlertCircle className="h-4 w-4" />
          ) : isCurrent ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Download className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">
            {failed ? "检查更新失败" : isCurrent ? "已是最新版本" : "发现新版本"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--ink-muted)]">
            {failed
              ? update.error
              : isCurrent
                ? `当前版本 ${update.currentVersion}`
                : `当前 ${update.currentVersion}，可更新到 ${latestLabel}`}
          </p>
          {!isCurrent && !failed && update.title && (
            <p className="mt-2 truncate text-xs font-medium text-[var(--ink)]">
              {update.title}
            </p>
          )}
          {!isCurrent && !failed && primaryAsset && (
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
      {!isCurrent && !failed ? (
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
      ) : failed ? (
        <div className="border-t border-[var(--line)] bg-white/45 px-4 py-3">
          <button
            type="button"
            disabled={checking}
            onClick={() => void checkForUpdate(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            重新检查
          </button>
        </div>
      ) : null}
    </div>
  );
}
