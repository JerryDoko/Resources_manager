"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { AudiobookReader } from "./AudiobookReader";
import { FullscreenPortal } from "./FullscreenPortal";

interface Props {
  itemId: string;
  title: string;
  onClose: () => void;
  chapterId?: string;
}

type Format = "txt" | "epub" | "pdf" | "unknown";


export function NovelReader({ itemId, title, onClose, chapterId }: Props) {
  const [format, setFormat] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/media/${itemId}?mode=meta`, {
          signal: AbortSignal.timeout(10000),
        });
        const data = await r.json();
        if (cancelled) return;
        const f = (data.format || "").toLowerCase();
        if (f === "txt" || f === "epub" || f === "pdf") setFormat(f);
        else setFormat("unknown");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (error) {
    return (
      <Shell title={title} onClose={onClose} subtitle="错误">
        <p className="p-8 text-red-700">{error}</p>
      </Shell>
    );
  }

  if (!format) {
    return (
      <Shell title={title} onClose={onClose} subtitle="加载中">
        <p className="animate-pulse-soft p-8 text-[#8a7f6a]">识别文件格式…</p>
      </Shell>
    );
  }

  if (format === "txt" || format === "epub") {
    return <AudiobookReader itemId={itemId} title={title} onClose={onClose} chapterId={chapterId} />;
  }
  if (format === "pdf") {
    return <PdfReader itemId={itemId} title={title} onClose={onClose} />;
  }

  return (
    <Shell title={title} onClose={onClose} subtitle="不支持">
      <p className="p-8 text-[#8a7f6a]">暂不支持此格式的在线阅读</p>
    </Shell>
  );
}

function Shell({
  title,
  subtitle,
  onClose,
  children,
  toolbar,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  return (
    <FullscreenPortal className="fixed inset-0 z-[300] flex flex-col bg-[#f4f0e6] animate-viewer-in">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5dfd2] px-4 py-3">
        <div className="min-w-0">
          <p className="text-display truncate text-lg font-semibold text-[#2a2418]">
            {title}
          </p>
          {subtitle && <p className="text-xs text-[#8a7f6a]">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-black/5">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">{children}</div>
    </FullscreenPortal>
  );
}


function PdfReader({ itemId, title, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const pdfRef = useRef<{
    getPage: (n: number) => Promise<{
      getViewport: (o: { scale: number }) => {
        width: number;
        height: number;
      };
      render: (o: {
        canvasContext: CanvasRenderingContext2D;
        viewport: unknown;
      }) => { promise: Promise<void> };
    }>;
    numPages: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const doc = await pdfjs.getDocument({
          url: `/api/media/${itemId}`,
          withCredentials: false,
        }).promise;
        if (cancelled) return;
        // pdf.js typings are stricter than our render usage
        pdfRef.current = doc as unknown as NonNullable<typeof pdfRef.current>;
        setPageCount(doc.numPages);
        setPage(1);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "PDF 加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      pdfRef.current = null;
    };
  }, [itemId]);

  useEffect(() => {
    const pdf = pdfRef.current;
    const el = containerRef.current;
    if (!pdf || !el || page < 1 || loading) return;

    let cancelled = false;
    (async () => {
      try {
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;
        const viewport = pdfPage.getViewport({ scale });
        el.innerHTML = "";
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = "mx-auto shadow-lg";
        el.appendChild(canvas);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await pdfPage.render({ canvasContext: ctx, viewport }).promise;

        fetch("/api/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "progress",
            id: itemId,
            progress: pageCount ? page / pageCount : 0,
          }),
          signal: AbortSignal.timeout(10000),
        }).catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "渲染失败");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, scale, pageCount, itemId, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp")
        setPage((p) => Math.max(1, p - 1));
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ")
        setPage((p) => Math.min(pageCount || p, p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageCount]);

  return (
    <Shell
      title={title}
      subtitle={pageCount ? `PDF · ${page} / ${pageCount}` : "PDF"}
      onClose={onClose}
      toolbar={
        <>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-[#e5dfd2] p-1.5 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs tabular-nums text-[#8a7f6a]">
            {page} / {pageCount || "—"}
          </span>
          <button
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-[#e5dfd2] p-1.5 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}
            className="rounded-lg border border-[#e5dfd2] px-2 py-1 text-xs"
          >
            −
          </button>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.1))}
            className="rounded-lg border border-[#e5dfd2] px-2 py-1 text-xs"
          >
            +
          </button>
        </>
      }
    >
      <div className="flex-1 overflow-auto bg-[#d9d2c4] scrollbar-thin">
        {loading && (
          <p className="animate-pulse-soft p-8 text-center text-[#8a7f6a]">
            加载 PDF…
          </p>
        )}
        {error && <p className="p-8 text-center text-red-700">{error}</p>}
        <div ref={containerRef} className="px-4 py-6" />
      </div>
    </Shell>
  );
}
