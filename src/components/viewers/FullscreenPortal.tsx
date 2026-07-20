"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 将阅读器挂到 body，避免被标签页 overflow 容器裁切；
 * 并尽量进入系统全屏（失败则仍铺满整个应用窗口）。
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
    const el = rootRef.current;
    if (!el) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const req =
      el.requestFullscreen?.bind(el) ||
      // Safari
      (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> })
        .webkitRequestFullscreen?.bind(el);
    req?.().catch(() => {
      /* 用户手势外或策略禁止时忽略，CSS 全屏仍有效 */
    });

    return () => {
      document.body.style.overflow = prevOverflow;
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
        webkitExitFullscreen?: () => Promise<void>;
      };
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        (document.exitFullscreen || doc.webkitExitFullscreen)?.call(document).catch(() => {});
      }
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div ref={rootRef} className={className}>
      {children}
    </div>,
    document.body
  );
}
