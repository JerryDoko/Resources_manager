import { createHash } from "crypto";
import { prepareSpeech } from "./narration";
import type { Chapter, Chunk, Position } from "./types";
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
// Swift splits by grapheme clusters after trimming each line; map its index to an original-text anchor.
export function legacyChunkOffset(text: string, index: number): number {
  const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
  const offsets: number[] = [];
  for (const line of text.matchAll(/[^\r\n\u0085\u2028\u2029]+/g)) {
    const trimmed = line[0].trim();
    let rest = trimmed, offset = line.index! + line[0].indexOf(trimmed);
    while (rest.length) {
      const chars = [...segmenter.segment(rest)].map(s => s.segment);
      let cut = Math.min(240, chars.length);
      if (chars.length > cut) for (let i = cut - 1; i >= 90; i--) {
        if ("。！？!?；;，,、".includes(chars[i])) { cut = i + 1; break; }
      }
      const raw = chars.slice(0, cut).join("");
      if (raw.trim()) offsets.push(offset + raw.indexOf(raw.trim()));
      offset += raw.length; rest = rest.slice(raw.length);
    }
  }
  return offsets[Math.max(0, Math.min(offsets.length - 1, index))] || 0;
}
export function splitChunks(text: string, block?: string): Chunk[] {
  const chunks: Chunk[] = [];
  for (const line of text.matchAll(/[^\r\n]+/g)) {
    let offset = line.index!;
    let rest = line[0];
    while (rest.length) {
      const chars = Array.from(rest);
      let cut = Math.min(240, chars.length);
      if (chars.length > cut) for (let i = cut - 1; i >= 90; i--) {
        if ("。！？!?；;，,、".includes(chars[i])) { cut = i + 1; break; }
      }
      const raw = chars.slice(0, cut).join("");
      const trim = raw.trim();
      if (trim) {
        const start = offset + raw.indexOf(trim), end = start + trim.length, hash = digest(trim);
        chunks.push({ id: `${start}-${hash.slice(0, 16)}`, start, end, text: trim, speech: prepareSpeech(trim), digest: hash, block });
      }
      offset += raw.length; rest = rest.slice(raw.length);
    }
  }
  return chunks;
}
export function splitChapters(text: string): Chapter[] {
  const headings = [...text.matchAll(/^(?:第[零〇一二三四五六七八九十百千万两\d]+[章回卷节部]|chapter\s+\d+)[^\r\n]{0,100}$/gim)];
  const starts = Array.from(new Set([0, ...headings.map(h => h.index!)])).sort((a,b) => a-b);
  return starts.map((start, i) => {
    const content = text.slice(start, starts[i+1] ?? text.length);
    return { id: `txt-${i}`, title: headings.find(h => h.index === start)?.[0] || "正文", text: content, digest: digest(content), chunks: splitChunks(content) };
  });
}
export function resolvePosition(chapter: Chapter, position: Position | null) {
  if (!position) return { index: 0, seconds: 0, changed: false };
  const exact = chapter.chunks.findIndex(c => c.id === position.chunkId && c.digest === position.digest);
  if (exact >= 0 && position.chunkVersion === 1) return { index: exact, seconds: position.seconds, changed: false };
  const same = chapter.chunks.map((c, index) => ({ c, index })).filter(({ c }) => c.digest === position.digest).sort((a,b) => Math.abs(a.c.start-position.offset)-Math.abs(b.c.start-position.offset))[0];
  const near = chapter.chunks.findIndex(c => c.end > position.offset);
  return { index: same?.index ?? (near < 0 ? Math.max(0, chapter.chunks.length-1) : near), seconds: 0, changed: true };
}
