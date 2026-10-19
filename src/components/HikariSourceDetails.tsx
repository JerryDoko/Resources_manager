"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { HIKARI_DOWNLOAD_STATES, readHikariSources, type HikariSource } from "@/lib/hikari-metadata";
import { CategorizedTags } from "./CategorizedTags";
import { groupTags } from "@/lib/tag-groups";

function SourceTags({ source }: { source: HikariSource }) {
  const [expanded, setExpanded] = useState(false);
  const names = [...new Set([...source.tags, ...source.authors.map((name) => `artist:${name}`)])];
  const tags = names.map((name) => ({ id: name, name, color: "#2a6f6f" }));
  if (!groupTags(tags).length) return null;
  return <div><dt className="sr-only">来源标签</dt><dd className="space-y-1.5">
    <CategorizedTags tags={tags} expanded={expanded} onExpand={() => setExpanded(true)} />
    {groupTags(tags).some((group) => group.tags.length > 5) && <button type="button" onClick={() => setExpanded((value) => !value)} className="text-xs text-[var(--accent)]">{expanded ? "收起来源标签" : "查看全部来源标签"}</button>}
  </dd></div>;
}

export function HikariSourceDetails({ metadata }: { metadata: string | null }) {
  const sources = readHikariSources(metadata);
  if (!sources.length) return null;
  return (
    <div className="space-y-3 border-t border-[var(--line)] pt-3 text-xs">
      <h2 className="font-semibold">下载来源 · {sources.length}</h2>
      {sources.map((source) => (
        <dl key={source.id} className="min-w-0 space-y-1.5 break-words text-[var(--ink-muted)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="font-medium text-[var(--ink)]">{source.site || "来源网站"}</dt>
            <dd>{HIKARI_DOWNLOAD_STATES[source.downloadState as keyof typeof HIKARI_DOWNLOAD_STATES] || "下载状态未知"}</dd>
          </div>
          {source.title && <div><dt className="sr-only">来源标题</dt><dd>{source.title}</dd></div>}
          <SourceTags source={source} />
          {source.sourceUrl && <div>
            <dt className="text-[var(--ink-faint)]">原始 URL</dt>
            <dd className="break-all">{source.sourceUrl}</dd>
            <dd className="mt-2"><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line)] px-2 py-1.5 text-[var(--accent)] hover:bg-[var(--accent-soft)]"><ExternalLink className="h-3.5 w-3.5" />打开来源</a></dd>
          </div>}
        </dl>
      ))}
    </div>
  );
}
