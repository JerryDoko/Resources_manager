import iconv from "iconv-lite";
import type { NovelEncoding } from "@/lib/encoding-types";

export type { NovelEncoding } from "@/lib/encoding-types";
export { NOVEL_ENCODINGS } from "@/lib/encoding-types";

function stripBom(buf: Buffer): { buf: Buffer; bom?: NovelEncoding } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { buf: buf.subarray(3), bom: "utf-8" };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { buf: buf.subarray(2), bom: "utf-16le" };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { buf: buf.subarray(2), bom: "utf-16be" };
  }
  return { buf };
}

function decodeWith(buf: Buffer, encoding: NovelEncoding): string {
  if (encoding === "utf-8") {
    return buf.toString("utf-8");
  }
  if (encoding === "utf-16le") {
    return buf.toString("utf16le");
  }
  if (encoding === "utf-16be") {
    // Node has no native utf16be; swap bytes then decode as le
    const swapped = Buffer.alloc(buf.length - (buf.length % 2));
    for (let i = 0; i + 1 < swapped.length; i += 2) {
      swapped[i] = buf[i + 1];
      swapped[i + 1] = buf[i];
    }
    return swapped.toString("utf16le");
  }
  // iconv-lite aliases
  const map: Record<string, string> = {
    gb18030: "gb18030",
    gbk: "gbk",
    big5: "big5",
    shift_jis: "shiftjis",
    "euc-jp": "eucjp",
    cp949: "cp949",
    "euc-kr": "euckr",
    "windows-1252": "win1252",
  };
  return iconv.decode(buf, map[encoding] || encoding);
}

function countScripts(text: string) {
  const sample = text.slice(0, Math.min(text.length, 8000));
  let cjk = 0;
  let hangul = 0;
  let kana = 0;
  let fffd = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0xfffd) fffd++;
    else if (c >= 0x4e00 && c <= 0x9fff) cjk++;
    else if (c >= 0x3400 && c <= 0x4dbf) cjk++;
    else if (c >= 0xac00 && c <= 0xd7af) hangul++;
    else if ((c >= 0x3040 && c <= 0x30ff) || (c >= 0x31f0 && c <= 0x31ff)) kana++;
  }
  return { cjk, hangul, kana, fffd };
}

/** Score decoded text — higher is better */
function scoreText(
  text: string,
  encoding: NovelEncoding,
  sig = countScripts(text)
): number {
  if (!text || text.length === 0) return -1e9;

  const sample = text.slice(0, Math.min(text.length, 8000));
  const len = sample.length;
  let score = 0;
  const { cjk, hangul, kana, fffd } = sig;

  const nulls = (sample.match(/\u0000/g) || []).length;
  score -= fffd * 200;
  score -= nulls * 120;

  let controls = 0;
  let asciiPrintable = 0;
  let latinExt = 0;
  let rare = 0;

  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) controls++;
    else if (c >= 0x20 && c <= 0x7e) asciiPrintable++;
    else if (c >= 0x00c0 && c <= 0x024f) latinExt++;
    else if (c >= 0xe000 && c <= 0xf8ff) rare++;
  }
  score -= controls * 40;

  score += cjk * 2;
  score += hangul * 12;
  score += kana * 12;
  score += asciiPrintable * 0.15;

  const script = cjk + hangul + kana;
  score += (script / len) * 600;

  const isJp = encoding === "shift_jis" || encoding === "euc-jp";
  const isKr = encoding === "cp949" || encoding === "euc-kr";
  const isZh = encoding === "gb18030" || encoding === "gbk" || encoding === "big5";

  if (kana > 0) {
    if (isJp) score += 500 + kana * 15;
    if (isZh || isKr) score -= 500;
  }

  if (hangul > 0 && fffd === 0 && kana === 0) {
    if (hangul >= Math.max(5, cjk)) {
      if (isKr) score += 450 + hangul * 8;
      if (isZh || isJp) score -= 350;
    } else if (hangul < cjk / 2) {
      if (isKr) score -= 300;
    }
  } else if (hangul > 0 && (fffd > 0 || kana > 0)) {
    if (isKr) score -= 400;
  }

  if (cjk > 5 && kana === 0 && hangul === 0 && fffd === 0) {
    if (isZh) score += 280;
    if (isJp) score -= 100;
    if (isKr) score -= 100;
  }

  const mojibakeHints = (sample.match(/[ÃÂåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/g) || []).length;
  score -= mojibakeHints * 6;
  score -= rare * 50;

  const lines = sample.split(/\r?\n/).length;
  if (lines > 2 && lines < len / 2) score += 30;

  const printableRatio = (asciiPrintable + script + latinExt) / len;
  if (printableRatio < 0.5) score -= 200;

  return score;
}

const CANDIDATES: NovelEncoding[] = [
  "utf-8",
  "gb18030",
  "gbk",
  "big5",
  "shift_jis",
  "euc-jp",
  "cp949",
  "euc-kr",
  "utf-16le",
  "utf-16be",
];

export interface DecodeResult {
  text: string;
  encoding: NovelEncoding;
  confidence: "bom" | "detected" | "manual";
  scores?: Partial<Record<NovelEncoding, number>>;
}

export function decodeNovelBuffer(
  raw: Buffer,
  forced?: NovelEncoding | null
): DecodeResult {
  const { buf, bom } = stripBom(raw);

  if (forced) {
    return {
      text: decodeWith(buf, forced),
      encoding: forced,
      confidence: "manual",
    };
  }

  if (bom) {
    return {
      text: decodeWith(buf, bom),
      encoding: bom,
      confidence: "bom",
    };
  }

  // Sample first ~64KB for speed on huge files
  const sampleBuf = buf.length > 65536 ? buf.subarray(0, 65536) : buf;

  const scores: Partial<Record<NovelEncoding, number>> = {};
  const scriptSignals: Partial<
    Record<NovelEncoding, { kana: number; hangul: number; cjk: number; fffd: number }>
  > = {};
  let best: NovelEncoding = "utf-8";
  let bestScore = -Infinity;

  for (const enc of CANDIDATES) {
    try {
      const decoded = decodeWith(sampleBuf, enc);
      const sig = countScripts(decoded);
      scriptSignals[enc] = sig;
      const s = scoreText(decoded, enc, sig);
      scores[enc] = s;
      if (s > bestScore) {
        bestScore = s;
        best = enc;
      }
    } catch {
      scores[enc] = -1e9;
    }
  }

  // Language lock: if any decode has clear kana, prefer Japanese codecs
  const kanaHits = CANDIDATES.filter((e) => (scriptSignals[e]?.kana ?? 0) >= 3);
  if (kanaHits.length > 0) {
    const jp = (["shift_jis", "euc-jp", "utf-8"] as NovelEncoding[]).filter(
      (e) => scores[e] != null
    );
    let jpBest: NovelEncoding = "shift_jis";
    let jpScore = -Infinity;
    for (const e of jp) {
      // Prefer codecs that actually produced kana
      const bonus = (scriptSignals[e]?.kana ?? 0) >= 3 ? 5000 : 0;
      const s = (scores[e] ?? -1e9) + bonus;
      if (s > jpScore) {
        jpScore = s;
        jpBest = e;
      }
    }
    best = jpBest;
    bestScore = jpScore;
  } else {
    // Hangul-dominant lock
    const hangulHits = CANDIDATES.filter((e) => {
      const sig = scriptSignals[e];
      return sig && sig.hangul >= 5 && sig.hangul >= sig.cjk && sig.fffd === 0;
    });
    if (hangulHits.length > 0) {
      let krBest: NovelEncoding = "cp949";
      let krScore = -Infinity;
      for (const e of (["cp949", "euc-kr", "utf-8"] as NovelEncoding[])) {
        const s = scores[e] ?? -1e9;
        if (s > krScore) {
          krScore = s;
          krBest = e;
        }
      }
      best = krBest;
      bestScore = krScore;
    }
  }

  // Optional: jschardet hint as a tie-breaker boost
  try {
    // dynamic require to keep optional
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jschardet = require("jschardet") as {
      detect: (b: Buffer) => { encoding?: string; confidence?: number };
    };
    const hint = jschardet.detect(sampleBuf);
    if (hint?.encoding && (hint.confidence ?? 0) > 0.85) {
      const mapped = mapJschardet(hint.encoding);
      if (mapped && scores[mapped] != null) {
        scores[mapped]! += 120 * (hint.confidence ?? 0);
        if (scores[mapped]! > bestScore) {
          bestScore = scores[mapped]!;
          best = mapped;
        }
      }
    }
  } catch {
    /* jschardet optional */
  }

  const text = decodeWith(buf, best);
  return { text, encoding: best, confidence: "detected", scores };
}

function mapJschardet(name: string): NovelEncoding | null {
  const n = name.toLowerCase().replace(/[_-]/g, "");
  if (n.includes("utf8")) return "utf-8";
  if (n.includes("utf16le") || n === "ucs2") return "utf-16le";
  if (n.includes("utf16be")) return "utf-16be";
  if (n.includes("gb18030")) return "gb18030";
  if (n.includes("gb2312") || n.includes("gbk") || n.includes("gbk2312")) return "gbk";
  if (n.includes("big5")) return "big5";
  if (n.includes("shiftjis") || n.includes("sjis") || n.includes("windows31j")) return "shift_jis";
  if (n.includes("eucjp")) return "euc-jp";
  if (n.includes("euckr") || n.includes("cp949") || n.includes("ks_c_5601")) return "cp949";
  return null;
}
