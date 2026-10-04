"use client";

import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

function isDesktopApp() {
  return typeof window !== "undefined" && !!window.rmDesktop?.isElectron;
}

export function WindowControls({ className }: { className?: string }) {
  const [desktop, setDesktop] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const bridge = window.rmDesktop;
    setDesktop(isDesktopApp() && bridge?.platform !== "darwin");
    if (!bridge?.isElectron) return;
    let disposed = false;
    void bridge.isMaximized?.().then(value => { if (!disposed) setMaximized(value); }).catch(() => {});
    const unsubscribe = bridge.onMaximizedChange?.(setMaximized);
    return () => { disposed = true; unsubscribe?.(); };
  }, []);

  if (!desktop) return null;

  return (
    <div className={cn("window-no-drag flex shrink-0 items-stretch text-[var(--ink)]", className)}>
      <button
        type="button"
        aria-label="最小化"
        title="最小化"
        onClick={() => window.rmDesktop?.minimize()}
        className="flex h-full w-[46px] items-center justify-center transition-colors hover:bg-black/10"
      >
        <Minus className="h-4 w-4" strokeWidth={1}/>
      </button>
      <button
        type="button"
        aria-label={maximized ? "还原" : "最大化"}
        title={maximized ? "还原" : "最大化"}
        onClick={() => window.rmDesktop?.toggleMaximize?.()}
        className="flex h-full w-[46px] items-center justify-center transition-colors hover:bg-black/10"
      >
        {maximized ? <Copy className="h-3.5 w-3.5" strokeWidth={1}/> : <Square className="h-3.5 w-3.5" strokeWidth={1}/>}
      </button>
      <button
        type="button"
        aria-label="关闭窗口"
        title="关闭窗口"
        onClick={() => window.rmDesktop?.close()}
        className="flex h-full w-[46px] items-center justify-center transition-colors hover:bg-[#c42b1c] hover:text-white"
      >
        <X className="h-4 w-4" strokeWidth={1}/>
      </button>
    </div>
  );
}
