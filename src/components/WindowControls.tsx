"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function isDesktopApp() {
  return typeof window !== "undefined" && !!window.rmDesktop?.isElectron;
}

export function WindowControls({ className }: { className?: string }) {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(isDesktopApp());
  }, []);

  if (!desktop) return null;

  return (
    <div className={cn("window-no-drag flex items-center gap-2", className)}>
      <button
        type="button"
        aria-label="关闭"
        title="关闭"
        onClick={() => window.rmDesktop?.close()}
        className="group flex h-3 w-3 items-center justify-center rounded-full bg-[#ff5f57] shadow-sm hover:brightness-95"
      >
        <span className="h-2 w-2 rounded-full bg-[#4d0000]/0 group-hover:bg-[#4d0000]/80" />
      </button>
      <button
        type="button"
        aria-label="缩小"
        title="缩小"
        onClick={() => window.rmDesktop?.minimize()}
        className="group flex h-3 w-3 items-center justify-center rounded-full bg-[#febc2e] shadow-sm hover:brightness-95"
      >
        <span className="h-2 w-2 rounded-full bg-[#5c4000]/0 group-hover:bg-[#5c4000]/80" />
      </button>
      <button
        type="button"
        aria-label="全屏"
        title="全屏"
        onClick={() => window.rmDesktop?.toggleFullscreen()}
        className="group flex h-3 w-3 items-center justify-center rounded-full bg-[#28c840] shadow-sm hover:brightness-95"
      >
        <span className="h-2 w-2 rounded-full bg-[#003400]/0 group-hover:bg-[#003400]/80" />
      </button>
    </div>
  );
}
