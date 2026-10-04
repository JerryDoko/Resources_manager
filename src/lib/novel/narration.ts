export const NARRATION_VERSION = "kokoro-v1.1-int8-book-v2";
export function prepareSpeech(input: string): string {
  let text = Array.from(input, c => {
    const n = c.codePointAt(0)!;
    return n >= 0xff01 && n <= 0xff5e && c !== "，" ? String.fromCodePoint(n - 0xfee0) : c === "\u3000" ? " " : c;
  }).join("").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "");
  const chars = Array.from(text);
  text = chars.map((c, i) => {
    const before = chars[i - 1] || "", after = chars[i + 1] || "";
    if ("'‘’".includes(c)) return /^[a-z0-9]$/i.test(before) && /^[a-z0-9]$/i.test(after) ? "'" : "，";
    if ('"“”„‟〝〞«»「」『』()[]{}【】〔〕〖〗'.includes(c)) return "，";
    if ("《》〈〉".includes(c)) return "";
    if (":：".includes(c)) return /\p{N}/u.test(before) && /\p{N}/u.test(after) ? c : "，";
    return c;
  }).join("")
    .replace(/[…⋯]+|\.{3,}|[—–―]+|-{2,}/g, "，")
    .replace(/\s+/g, " ")
    .replace(/[,，、](?:\s*[,，、])+/g, "，")
    .replace(/[,，、]\s*([。.!?！？;；])/g, "$1")
    .replace(/([。.!?！？;；])\s*[,，、]/g, "$1")
    .replace(/^[ ，,、]+|[ ，,、]+$/g, "");
  return /[\p{L}\p{Nd}]/u.test(text) ? text : "";
}
