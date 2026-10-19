"use client";

import { groupTags, type DisplayTag } from "@/lib/tag-groups";
import { cn } from "@/lib/utils";

export function CategorizedTags({
  tags,
  expanded = false,
  selectedIds = [],
  onToggle,
  onExpand,
  disabled = false,
}: {
  tags: readonly DisplayTag[];
  expanded?: boolean;
  selectedIds?: readonly string[];
  onToggle?: (id: string) => void;
  onExpand?: () => void;
  disabled?: boolean;
}) {
  return (
    <dl className="space-y-2.5">
      {groupTags(tags).map((group) => (
        <div key={group.key} data-tag-category={group.key} className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5">
          <dt className="w-12 shrink-0 py-1 text-xs font-medium text-[var(--ink-muted)]">{group.label}：</dt>
          <dd className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {(expanded ? group.tags : group.tags.slice(0, 5)).map((tag) => {
              const selected = selectedIds.includes(tag.id);
              const className = cn(
                "inline-flex max-w-full items-center break-words rounded-md border px-2 py-1 text-xs leading-4 [overflow-wrap:anywhere]",
                onToggle && selected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-white text-[var(--ink-muted)]",
                onToggle && "transition hover:border-[var(--accent)] disabled:opacity-50"
              );
              return onToggle ? (
                <button key={tag.id} type="button" onClick={() => onToggle(tag.id)} disabled={disabled} aria-pressed={selected} title={tag.name} className={className}>{tag.displayName}</button>
              ) : (
                <span key={tag.id} title={tag.name} className={className}>{tag.displayName}</span>
              );
            })}
            {!expanded && group.tags.length > 5 && (onExpand ? (
              <button type="button" onClick={onExpand} className="h-6 rounded-md px-2 text-xs text-[var(--ink-muted)] hover:bg-white" title={`查看${group.label}的全部 ${group.tags.length} 个标签`} aria-label={`查看全部${group.label}标签`}>…</button>
            ) : <span className="px-1 text-xs text-[var(--ink-faint)]" aria-label={`另有 ${group.tags.length - 5} 个${group.label}标签`}>…</span>)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
