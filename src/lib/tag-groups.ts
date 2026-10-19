export interface DisplayTag {
  id: string;
  name: string;
  color: string;
}

export const TAG_CATEGORIES = [
  { key: "work", label: "原著" },
  { key: "character", label: "角色" },
  { key: "general", label: "标签" },
  { key: "author", label: "作者" },
] as const;

type Category = (typeof TAG_CATEGORIES)[number]["key"];
const tagCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
const prefixes: Record<string, Category> = {
  parody: "work", copyright: "work", series: "work", franchise: "work", 原著: "work", 原作: "work", 作品: "work",
  character: "character", characters: "character", 角色: "character", 人物: "character",
  artist: "author", author: "author", creator: "author", 作者: "author", 绘师: "author", 繪師: "author", 画师: "author", 畫師: "author",
  tag: "general", tags: "general", general: "general", 标签: "general", 標籤: "general",
};

export function tagDisplay(name: string): { category: Category; label: string } {
  const trimmed = name.trim();
  const match = /^([^:：]+)[:：]\s*(.*)$/u.exec(trimmed);
  const prefix = match?.[1].trim().toLowerCase();
  const category = prefix && Object.hasOwn(prefixes, prefix) ? prefixes[prefix] : undefined;
  return category
    ? { category, label: match![2].trim() }
    : { category: "general", label: trimmed };
}

export function groupTags<T extends DisplayTag>(tags: readonly T[]) {
  const groups = TAG_CATEGORIES.map((category) => ({ ...category, tags: [] as Array<T & { displayName: string }> }));
  for (const tag of tags) {
    const display = tagDisplay(tag.name);
    if (!display.label) continue;
    groups.find((group) => group.key === display.category)!.tags.push({ ...tag, displayName: display.label });
  }
  return groups.filter((group) => group.tags.length > 0).map((group) => ({
    ...group,
    tags: group.tags.sort((a, b) => tagCollator.compare(a.displayName, b.displayName) || a.id.localeCompare(b.id)),
  }));
}
