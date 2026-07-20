"use client";

import { useEffect, useState } from "react";
import { Keyboard, RotateCcw, Plus, X } from "lucide-react";
import {
  DEFAULT_VIDEO_SHORTCUTS,
  SHORTCUT_ACTIONS,
  SHORTCUT_LABELS,
  eventToShortcut,
  parseShortcuts,
  shortcutDisplay,
  type ShortcutAction,
  type VideoShortcuts,
} from "@/lib/shortcuts";

export function ShortcutSettings() {
  const [sc, setSc] = useState<VideoShortcuts>(
    structuredClone(DEFAULT_VIDEO_SHORTCUTS)
  );
  const [listening, setListening] = useState<ShortcutAction | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings", { signal: AbortSignal.timeout(10000) })
      .then((r) => r.json())
      .then((data) => {
        try {
          setSc(
            parseShortcuts(
              typeof data.videoShortcuts === "string"
                ? JSON.parse(data.videoShortcuts)
                : data.videoShortcuts
            )
          );
        } catch {
          setSc(structuredClone(DEFAULT_VIDEO_SHORTCUTS));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setListening(null);
        return;
      }
      const key = eventToShortcut(e);
      setSc((prev) => {
        const cur = prev[listening];
        if (cur.includes(key)) return prev;
        return { ...prev, [listening]: [...cur, key] };
      });
      setListening(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening]);

  const removeKey = (action: ShortcutAction, key: string) => {
    setSc((prev) => ({
      ...prev,
      [action]: prev[action].filter((k) => k !== key),
    }));
  };

  const save = async () => {
    setError(null);
    // 跨行为键位冲突检测
    const seen = new Map<string, ShortcutAction>();
    for (const action of SHORTCUT_ACTIONS) {
      for (const key of sc[action]) {
        const other = seen.get(key);
        if (other && other !== action) {
          setError(
            `快捷键冲突：${shortcutDisplay(key)} 同时绑定了「${SHORTCUT_LABELS[other]}」和「${SHORTCUT_LABELS[action]}」`
          );
          return;
        }
        seen.set(key, action);
      }
    }
    for (const action of SHORTCUT_ACTIONS) {
      if (sc[action].length === 0) {
        setError(`「${SHORTCUT_LABELS[action]}」至少需要一个键位`);
        return;
      }
    }

    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoShortcuts: JSON.stringify(sc) }),
      signal: AbortSignal.timeout(10000),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => setSc(structuredClone(DEFAULT_VIDEO_SHORTCUTS));

  return (
    <section>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Keyboard className="h-4 w-4 text-[var(--accent)]" />
        视频快捷键
      </h3>
      <p className="mb-3 text-xs text-[var(--ink-muted)]">
        每个行为可绑定多个键。点「+」再按键添加；点键位上的 ×
        删除。默认：[ / ] 上下集，←/→ 点按跳转，长按右 3 倍速，长按左快退。
      </p>

      <div className="space-y-2 rounded-xl border border-[var(--line)] bg-white p-3">
        {SHORTCUT_ACTIONS.map((action) => (
          <div
            key={action}
            className="flex flex-wrap items-center justify-between gap-2 py-1"
          >
            <span className="min-w-[7rem] text-sm text-[var(--ink)]">
              {SHORTCUT_LABELS[action]}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {sc[action].map((key) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-2 py-1 font-mono text-xs"
                >
                  {shortcutDisplay(key)}
                  <button
                    type="button"
                    onClick={() => removeKey(action, key)}
                    className="rounded p-0.5 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600"
                    title="移除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setListening(action)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                  listening === action
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] animate-pulse-soft"
                    : "border-dashed border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
              >
                <Plus className="h-3 w-3" />
                {listening === action ? "按下按键…" : "添加"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-xs text-[var(--ink-muted)]">
          点按跳转（秒）
          <input
            type="number"
            min={1}
            max={60}
            value={sc.seekStep}
            onChange={(e) =>
              setSc((s) => ({ ...s, seekStep: Number(e.target.value) || 5 }))
            }
            className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="text-xs text-[var(--ink-muted)]">
          长按判定（ms）
          <input
            type="number"
            min={80}
            max={1000}
            step={20}
            value={sc.longPressMs}
            onChange={(e) =>
              setSc((s) => ({
                ...s,
                longPressMs: Number(e.target.value) || 200,
              }))
            }
            className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="text-xs text-[var(--ink-muted)]">
          长按右倍速
          <input
            type="number"
            min={1.5}
            max={8}
            step={0.5}
            value={sc.longPressSpeed}
            onChange={(e) =>
              setSc((s) => ({
                ...s,
                longPressSpeed: Number(e.target.value) || 3,
              }))
            }
            className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm text-[var(--ink)]"
          />
        </label>
        <label className="text-xs text-[var(--ink-muted)]">
          长按左后退（秒/秒）
          <input
            type="number"
            min={2}
            max={30}
            value={sc.rewindPerSec}
            onChange={(e) =>
              setSc((s) => ({
                ...s,
                rewindPerSec: Number(e.target.value) || 8,
              }))
            }
            className="mt-1 w-full rounded-lg border border-[var(--line)] px-2 py-1.5 text-sm text-[var(--ink)]"
          />
        </label>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && (
        <p className="mt-2 text-xs text-[var(--accent)]">快捷键已保存</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm text-white"
        >
          保存快捷键
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-muted)] hover:bg-[var(--bg)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          恢复默认
        </button>
      </div>
    </section>
  );
}
