import { BookOpen } from "lucide-react";

export function NovelHelpLink({ section = "start", children = "安装与排错指南" }: { section?: string; children?: React.ReactNode }) {
  return <a href={`/help/novel#${section}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] underline underline-offset-4"><BookOpen size={14}/>{children}</a>;
}
