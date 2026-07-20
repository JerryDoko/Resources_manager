"use client";

import { useEffect } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  items: { id: string; title: string }[];
  currentId: string;
  onClose: () => void;
  onNavigate: (id: string) => void;
}

export function PhotoViewer({ items, currentId, onClose, onNavigate }: Props) {
  const index = items.findIndex((i) => i.id === currentId);
  const current = items[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onNavigate(items[index - 1].id);
      if (e.key === "ArrowRight" && index < items.length - 1)
        onNavigate(items[index + 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items, onClose, onNavigate]);

  if (!current) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0f1415]">
      <header className="flex shrink-0 items-center justify-between px-4 py-3 text-white/90">
        <div>
          <p className="text-sm font-medium">{current.title}</p>
          <p className="text-xs text-white/40">
            {index + 1} / {items.length}
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </header>
      {/* 取宽高约束中较小的一边等比适配 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${current.id}`}
          alt={current.title}
          className="h-full w-full object-contain"
        />
        {index > 0 && (
          <button
            onClick={() => onNavigate(items[index - 1].id)}
            className="absolute left-3 rounded-full bg-black/40 p-3 text-white"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {index < items.length - 1 && (
          <button
            onClick={() => onNavigate(items[index + 1].id)}
            className="absolute right-3 rounded-full bg-black/40 p-3 text-white"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}
