export type NovelEncoding =
  | "utf-8"
  | "utf-16le"
  | "utf-16be"
  | "gb18030"
  | "gbk"
  | "big5"
  | "shift_jis"
  | "euc-jp"
  | "cp949"
  | "euc-kr"
  | "windows-1252";

export const NOVEL_ENCODINGS: { id: NovelEncoding; label: string }[] = [
  { id: "utf-8", label: "UTF-8" },
  { id: "gb18030", label: "简体中文 (GB18030)" },
  { id: "gbk", label: "简体中文 (GBK)" },
  { id: "big5", label: "繁体中文 (Big5)" },
  { id: "shift_jis", label: "日本語 (Shift_JIS)" },
  { id: "euc-jp", label: "日本語 (EUC-JP)" },
  { id: "cp949", label: "한국어 (CP949)" },
  { id: "euc-kr", label: "한국어 (EUC-KR)" },
  { id: "utf-16le", label: "UTF-16 LE" },
  { id: "utf-16be", label: "UTF-16 BE" },
];
