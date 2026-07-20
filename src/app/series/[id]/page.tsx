"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useLibrary } from "@/lib/store";

/** 深链兼容：打开对应系列标签并回到工作区 */
export default function SeriesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { openSeriesTab } = useLibrary();

  useEffect(() => {
    openSeriesTab({
      seriesId: id,
      title: "加载中…",
      mediaType: "manga",
    });
    router.replace("/");
  }, [id, openSeriesTab, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-[var(--ink-muted)]">
      正在打开标签页…
    </div>
  );
}
