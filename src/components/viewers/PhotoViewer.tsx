"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { FullscreenPortal } from "./FullscreenPortal";

interface Props {
  items: { id: string; title: string }[];
  currentId: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
}

export function PhotoViewer({ items, currentId, onClose, onNavigate }: Props) {
  const index = items.findIndex((i) => i.id === currentId);
  const current = items[index];
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | 0>(0);

  const bumpChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), 2500);
  }, []);

  useEffect(() => {
    bumpChrome();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [bumpChrome, currentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(items[index - 1].id);
      if (e.key === "ArrowRight" && index < items.length - 1)
        onNavigate(items[index + 1].id);
      bumpChrome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items, onClose, onNavigate, bumpChrome]);

  if (!current) return null;

  const pageText = `${index + 1} / ${items.length}`;

  return (
    <FullscreenPortal className="fixed inset-0 z-[300] flex flex-col bg-[#0f1415] animate-viewer-in">
      <header
        className={`flex shrink-0 items-center justify-between px-4 py-3 text-white/90 transition-opacity ${
          chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div>
          <p className="text-sm font-medium">{current.title}</p>
          <p className="text-xs text-white/40">
            {pageText} · ←/→ 切换 · Esc 关闭
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </header>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2"
        onMouseMove={bumpChrome}
        onClick={bumpChrome}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${current.id}`}
          alt={current.title}
          className="h-full w-full object-contain"
        />
        {index > 0 && (
          <button
            onClick={() => onNavigate(items[index - 1].id)}
            className={`absolute left-3 rounded-full bg-black/40 p-3 text-white transition-opacity ${
              chromeVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            onClick={() => onNavigate(items[index + 1].id)}
            className={`absolute right-3 rounded-full bg-black/40 p-3 text-white transition-opacity ${
              chromeVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/65 px-4 py-1.5 text-sm font-medium tabular-nums tracking-wide text-white shadow-lg backdrop-blur-sm">
          {pageText}
        </div>
      </div>
    </FullscreenPortal>
  );
}
