"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { useLibrary } from "@/lib/store";

interface PendingConfirmation {
  id: string;
  action: string;
  description: string;
  params: Record<string, unknown>;
}

export function AiConfirmationPrompt() {
  const { refresh } = useLibrary();
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [pollGeneration, setPollGeneration] = useState(0);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/settings", {
        signal: AbortSignal.timeout(10000),
      });
      const settings = await response.json();
      setEnabled(!!settings.aiEnabled);
      setToken(String(settings.aiControlToken || ""));
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
    window.addEventListener("rm:ai-settings-updated", loadSettings);
    return () => window.removeEventListener("rm:ai-settings-updated", loadSettings);
  }, [loadSettings]);

  useEffect(() => {
    if (!enabled || !token) {
      setPending(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const poll = async () => {
      while (!cancelled) {
        try {
          const response = await fetch("/api/ai/confirmations?wait=1", {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          const data = await response.json();
          if (cancelled) return;
          const next = data.confirmations?.[0] || null;
          setPending(next);
          if (next) return;
        } catch {
          if (cancelled) return;
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, pollGeneration, token]);

  const decide = async (decision: "approve" | "reject") => {
    if (!pending) return;
    setBusy(true);
    try {
      const response = await fetch("/api/ai/confirmations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: pending.id, decision }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "确认失败");
      setPending(null);
      setPollGeneration((current) => current + 1);
      if (decision === "approve") await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!pending) return null;

  const targetCount = Array.isArray(pending.params.seriesIds)
    ? pending.params.seriesIds.length
    : 0;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-lg border border-amber-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">AI 请求危险操作</h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{pending.description}</p>
            <p className="mt-2 rounded-md bg-[var(--bg)] px-3 py-2 text-xs text-[var(--ink-muted)]">
              动作：{pending.action}
              {targetCount > 0 ? ` · 影响 ${targetCount} 个系列` : ""}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("reject")}
            className="flex items-center gap-1.5 rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--ink-muted)] hover:bg-[var(--bg)] disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            拒绝
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide("approve")}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
