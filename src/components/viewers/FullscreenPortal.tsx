"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 将阅读器挂到 body，盖住标签栏/标题栏，避免与详情页叠层。
 * 仅用 CSS 铺满窗口（不调系统全屏），减少 Electron 下双层 UI 问题。
 */
export function FullscreenPortal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.rmViewer = "1";
    return () => {
      document.body.style.overflow = prevOverflow;
      delete document.body.dataset.rmViewer;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div ref={rootRef} className={className} data-rm-fullscreen-viewer>
      {children}
    </div>,
    document.body
  );
}
