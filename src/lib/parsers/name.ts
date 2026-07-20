/**
 * Parse common media naming patterns:
 *   [Author] Title
 *   (Author) Title
 *   Author - Title
 *   Title
 */
export interface ParsedName {
  author: string | null;
  title: string;
}

export function parseMediaName(raw: string): ParsedName {
  const name = raw
    .replace(/\.[^.]+$/, "")
    .replace(/\[.*?\]/g, (m) => m) // keep for author parse
    .trim();

  // [Author] Title
  const bracket = name.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (bracket) {
    return { author: bracket[1].trim(), title: cleanTitle(bracket[2]) };
  }

  // (Author) Title — ignore volume/chapter numbers in parens like (Vol.1)
  const paren = name.match(/^\(([^)]+)\)\s*(.+)$/);
  if (paren && !/^(vol|ch|ep|第|巻)/i.test(paren[1])) {
    return { author: paren[1].trim(), title: cleanTitle(paren[2]) };
  }

  // Author - Title
  const dash = name.match(/^([^-–—]{1,40})\s*[-–—]\s*(.+)$/);
  if (dash && !/^\d+$/.test(dash[1].trim())) {
    return { author: dash[1].trim(), title: cleanTitle(dash[2]) };
  }

  return { author: null, title: cleanTitle(name) };
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\[.*?\]\s*/g, " ")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "未命名";
}

/**
 * Guess series title from a file path by looking at parent folder(s)
 * or stripping episode/chapter numbers.
 * 会沿目录向上跳过「话/卷」文件夹，直到 libraryRoot。
 */
export function inferSeriesTitle(
  filePath: string,
  fileName: string,
  libraryRoot?: string
): ParsedName {
  const normalizedRoot = libraryRoot
    ? libraryRoot.replace(/\\/g, "/").replace(/\/$/, "")
    : null;
  let dir = filePath.replace(/\\/g, "/").replace(/\/[^/]+$/, "");

  while (dir && dir !== "." && dir !== "/" && dir !== normalizedRoot) {
    const parentName = dir.split("/").pop() || "";
    if (
      parentName &&
      parentName !== "." &&
      !parentName.match(/^[A-Za-z]:$/) &&
      !isLikelyVolumeFolder(parentName)
    ) {
      const fromParent = parseMediaName(parentName);
      if (fromParent.title && fromParent.title !== "未命名") {
        return fromParent;
      }
    }
    const next = dir.replace(/\/[^/]+$/, "");
    if (next === dir) break;
    dir = next;
  }

  const fromFile = parseMediaName(fileName);
  // Strip trailing episode markers: ep01, ch.12, 第1话, #03
  fromFile.title = fromFile.title
    .replace(/\s*(ep|episode|ch|chapter|vol|volume|#|第)\s*\d+.*$/i, "")
    .replace(/\s*\d{1,4}\s*$/, "")
    .trim() || fromFile.title;

  return fromFile;
}

function isLikelyVolumeFolder(name: string): boolean {
  const n = name.trim();
  if (/^(vol|volume|ch|chapter|ep|episode|disc)\.?\s*\d+/i.test(n)) return true;
  if (/^第?\s*\d+\s*[话話卷章集话]/u.test(n)) return true;
  if (/^\d{1,4}([\-_.].*)?$/i.test(n)) return true;
  return false;
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
