"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProfileMeta {
  id: string;
  name: string;
  createdAt: number;
}

interface Registry {
  activeId: string;
  defaultId: string;
  profiles: ProfileMeta[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileSwitcher({ open, onClose }: Props) {
  const [reg, setReg] = useState<Registry | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/profiles", { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (data.error) {
      setMsg(data.error);
      return;
    }
    setReg(data);
  }, []);

  useEffect(() => {
    if (open) {
      setMsg(null);
      setCreating(false);
      setRenamingId(null);
      setConfirmDeleteId(null);
      load();
    }
  }, [open, load]);

  if (!open) return null;

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const text = await res.text();
      let data: {
        error?: string;
        registry?: Registry;
        reload?: boolean;
      } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setMsg(`请求失败 (${res.status})`);
        return;
      }
      if (!res.ok) {
        setMsg(data.error || "操作失败");
        return;
      }
      if (data.reload) {
        window.location.href = "/";
        return;
      }
      if (data.registry) setReg(data.registry);
      setCreating(false);
      setNewName("");
      setRenamingId(null);
      setConfirmDeleteId(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[#f7f9f8] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">工作区</p>
            <p className="text-[11px] text-[var(--ink-faint)]">
              各配置相互独立 · 切换后自动重载
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {reg?.profiles.map((p) => {
            const active = p.id === reg.activeId;
            const isDefault = p.id === reg.defaultId;
            const renaming = renamingId === p.id;
            const confirming = confirmDeleteId === p.id;

            return (
              <li
                key={p.id}
                className={cn(
                  "rounded-xl border px-3 py-2",
                  active
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-transparent bg-white"
                )}
              >
                {renaming ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!renameValue.trim()) return;
                      act({ action: "rename", id: p.id, name: renameValue.trim() });
                    }}
                  >
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-white px-2 py-1 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-lg bg-[var(--accent)] px-2 py-1 text-xs text-white"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenamingId(null)}
                      className="rounded-lg px-2 py-1 text-xs text-[var(--ink-muted)]"
                    >
                      取消
                    </button>
                  </form>
                ) : confirming ? (
                  <div className="space-y-2">
                    <p className="text-xs text-red-700">
                      删除「{p.name}」？索引不可恢复（磁盘文件不受影响）
                    </p>
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        onClick={() => act({ action: "delete", id: p.id })}
                        className="rounded-lg bg-red-600 px-2 py-1 text-xs text-white"
                      >
                        确认删除
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg px-2 py-1 text-xs text-[var(--ink-muted)]"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      disabled={busy || active}
                      onClick={() => act({ action: "switch", id: p.id })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-[10px] text-[var(--ink-faint)]">
                        {active ? "当前" : "点击切换"}
                        {isDefault ? " · 默认启动" : ""}
                      </p>
                    </button>
                    <button
                      title="设为默认启动"
                      disabled={busy}
                      onClick={() => act({ action: "setDefault", id: p.id })}
                      className={cn(
                        "rounded-lg p-1.5",
                        isDefault
                          ? "text-[var(--accent-hot)]"
                          : "text-[var(--ink-faint)] hover:bg-[var(--bg)]"
                      )}
                    >
                      <Star
                        className={cn("h-3.5 w-3.5", isDefault && "fill-current")}
                      />
                    </button>
                    <button
                      title="重命名"
                      disabled={busy}
                      onClick={() => {
                        setRenamingId(p.id);
                        setRenameValue(p.name);
                        setConfirmDeleteId(null);
                      }}
                      className="rounded-lg px-1.5 py-1 text-[10px] text-[var(--ink-muted)] hover:bg-[var(--bg)]"
                    >
                      改名
                    </button>
                    {reg.profiles.length > 1 && (
                      <button
                        title="删除"
                        disabled={busy}
                        onClick={() => {
                          setConfirmDeleteId(p.id);
                          setRenamingId(null);
                        }}
                        className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {active && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {creating ? (
          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name =
                newName.trim() || `配置 ${(reg?.profiles.length || 0) + 1}`;
              act({ action: "create", name });
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="新配置名称"
              className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs text-white"
            >
              创建
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
              className="rounded-xl px-2 py-2 text-xs text-[var(--ink-muted)]"
            >
              取消
            </button>
          </form>
        ) : (
          <button
            disabled={busy}
            onClick={() => {
              setCreating(true);
              setNewName(`配置 ${(reg?.profiles.length || 0) + 1}`);
              setRenamingId(null);
              setConfirmDeleteId(null);
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--line)] bg-white py-2 text-xs text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Plus className="h-3.5 w-3.5" />
            新建配置
          </button>
        )}

        {msg && <p className="mt-2 text-xs text-red-600">{msg}</p>}
      </div>
    </div>
  );
}
