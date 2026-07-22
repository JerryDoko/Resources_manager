"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  List,
  BookOpen,
} from "lucide-react";
import { NOVEL_ENCODINGS, type NovelEncoding } from "@/lib/encoding-types";
import { FullscreenPortal } from "./FullscreenPortal";

interface Props {
  itemId: string;
  title: string;
  onClose: () => void;
}

type Format = "txt" | "epub" | "pdf" | "unknown";

interface EpubChapter {
  id: string;
  title: string;
  href: string;
}

export function NovelReader({ itemId, title, onClose }: Props) {
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

  if (format === "txt") {
    return <TxtReader itemId={itemId} title={title} onClose={onClose} />;
  }
  if (format === "epub") {
    return <EpubReader itemId={itemId} title={title} onClose={onClose} />;
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

function TxtReader({ itemId, title, onClose }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(18);
  const [encoding, setEncoding] = useState<NovelEncoding | "auto">("auto");
  const [detected, setDetected] = useState<string | null>(null);

  const load = useCallback(
    async (enc: NovelEncoding | "auto") => {
      setLoading(true);
      setError(null);
      try {
        const qs =
          enc === "auto"
            ? `/api/media/${itemId}?mode=text`
            : `/api/media/${itemId}?mode=text&encoding=${enc}`;
        const r = await fetch(qs, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) {
          const err = await r.json().catch(() => null);
          throw new Error(err?.error || "无法读取文本");
        }
        const detectedEnc = r.headers.get("X-Detected-Encoding");
        if (detectedEnc) setDetected(detectedEnc);
        setText(await r.text());
      } catch (e) {
        setError(e instanceof Error ? e.message : "读取失败");
      } finally {
        setLoading(false);
      }
    },
    [itemId]
  );

  useEffect(() => {
    load(encoding);
  }, [load, encoding]);

  const label =
    encoding === "auto"
      ? `TXT · 自动 · ${detected || "检测中"}`
      : `TXT · ${NOVEL_ENCODINGS.find((e) => e.id === encoding)?.label || encoding}`;

  return (
    <Shell
      title={title}
      subtitle={label}
      onClose={onClose}
      toolbar={
        <>
          <select
            value={encoding}
            onChange={(e) => setEncoding(e.target.value as NovelEncoding | "auto")}
            className="max-w-[200px] rounded-lg border border-[#e5dfd2] bg-white px-2 py-1.5 text-xs"
          >
            <option value="auto">自动检测</option>
            {NOVEL_ENCODINGS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <FontButtons fontSize={fontSize} setFontSize={setFontSize} />
        </>
      }
    >
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <article
          className="mx-auto max-w-2xl px-6 py-10 leading-[1.9] text-[#2a2418]"
          style={{ fontSize }}
        >
          {loading && <p className="animate-pulse-soft text-[#8a7f6a]">加载中…</p>}
          {error && <p className="text-red-700">{error}</p>}
          {!loading && !error && (
            <pre className="whitespace-pre-wrap font-[inherit]">{text}</pre>
          )}
        </article>
      </div>
    </Shell>
  );
}

function EpubReader({ itemId, title, onClose }: Props) {
  const [chapters, setChapters] = useState<EpubChapter[]>([]);
  const [bookTitle, setBookTitle] = useState(title);
  const [index, setIndex] = useState(0);
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToc, setShowToc] = useState(true);
  const [fontSize, setFontSize] = useState(18);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/media/${itemId}?mode=epub`, {
          signal: AbortSignal.timeout(30000),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "EPUB 解析失败");
        if (cancelled) return;
        setChapters(data.chapters || []);
        if (data.title) setBookTitle(data.title);
        setIndex(0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "解析失败");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  useEffect(() => {
    if (!chapters[index]) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const href = encodeURIComponent(chapters[index].href);
        const r = await fetch(
          `/api/media/${itemId}?mode=epub-chapter&href=${href}`,
          { signal: AbortSignal.timeout(30000) }
        );
        if (!r.ok) {
          const err = await r.json().catch(() => null);
          throw new Error(err?.error || "章节加载失败");
        }
        const content = await r.text();
        if (!cancelled) setHtml(content);
        // Save progress
        fetch("/api/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "progress",
            id: itemId,
            progress: chapters.length ? (index + 1) / chapters.length : 0,
          }),
          signal: AbortSignal.timeout(10000),
        }).catch(() => {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapters, index, itemId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight")
        setIndex((i) => Math.min(chapters.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chapters.length]);

  const chapter = chapters[index];

  return (
    <Shell
      title={bookTitle || title}
      subtitle={
        chapter
          ? `EPUB · ${index + 1}/${chapters.length} · ${chapter.title}`
          : "EPUB"
      }
      onClose={onClose}
      toolbar={
        <>
          <button
            onClick={() => setShowToc((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-[#e5dfd2] px-2 py-1.5 text-xs"
          >
            <List className="h-3.5 w-3.5" />
            目录
          </button>
          <button
            disabled={index <= 0}
            onClick={() => setIndex((i) => i - 1)}
            className="rounded-lg border border-[#e5dfd2] p-1.5 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            disabled={index >= chapters.length - 1}
            onClick={() => setIndex((i) => i + 1)}
            className="rounded-lg border border-[#e5dfd2] p-1.5 disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <FontButtons fontSize={fontSize} setFontSize={setFontSize} />
        </>
      }
    >
      {showToc && (
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-[#e5dfd2] bg-[#efeae0] scrollbar-thin">
          <div className="px-3 py-2 text-xs font-medium text-[#8a7f6a]">目录</div>
          <ul className="pb-4">
            {chapters.map((ch, i) => (
              <li key={ch.id + ch.href}>
                <button
                  onClick={() => {
                    setIndex(i);
                    if (window.innerWidth < 768) setShowToc(false);
                  }}
                  className={`w-full truncate px-3 py-2 text-left text-sm ${
                    i === index
                      ? "bg-[#1f6f6a] text-white"
                      : "text-[#2a2418] hover:bg-black/5"
                  }`}
                >
                  {ch.title}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {loading && (
          <p className="animate-pulse-soft p-8 text-[#8a7f6a]">加载章节…</p>
        )}
        {error && <p className="p-8 text-red-700">{error}</p>}
        {!loading && !error && (
          <iframe
            title={chapter?.title || "chapter"}
            srcDoc={html.replace(
              /font-size:\s*[\d.]+rem/i,
              `font-size:${(fontSize / 16).toFixed(3)}rem`
            )}
            className="h-full w-full flex-1 border-0 bg-[#f4f0e6]"
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </Shell>
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

function FontButtons({
  fontSize,
  setFontSize,
}: {
  fontSize: number;
  setFontSize: (fn: (s: number) => number) => void;
}) {
  return (
    <>
      <button
        onClick={() => setFontSize((s) => Math.max(14, s - 2))}
        className="rounded-lg border border-[#e5dfd2] px-2 py-1 text-sm"
      >
        A-
      </button>
      <button
        onClick={() => setFontSize((s) => Math.min(28, s + 2))}
        className="rounded-lg border border-[#e5dfd2] px-2 py-1 text-sm"
      >
        A+
      </button>
      <span className="hidden text-[10px] text-[#8a7f6a] sm:inline">
        <BookOpen className="mr-0.5 inline h-3 w-3" />
        {fontSize}px
      </span>
    </>
  );
}
