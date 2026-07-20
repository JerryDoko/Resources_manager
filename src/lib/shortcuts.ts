export type ShortcutAction =
  | "playPause"
  | "seekBack"
  | "seekForward"
  | "prevVideo"
  | "nextVideo"
  | "frameBack"
  | "frameForward"
  | "markA"
  | "markB"
  | "toggleSubs"
  | "capture"
  | "close";

/** 一个行为可绑定多个键位 */
export type KeyBinding = string[];

export interface VideoShortcuts {
  playPause: KeyBinding;
  seekBack: KeyBinding;
  seekForward: KeyBinding;
  prevVideo: KeyBinding;
  nextVideo: KeyBinding;
  frameBack: KeyBinding;
  frameForward: KeyBinding;
  markA: KeyBinding;
  markB: KeyBinding;
  toggleSubs: KeyBinding;
  capture: KeyBinding;
  close: KeyBinding;
  /** 点按左右键跳转秒数 */
  seekStep: number;
  /** 长按判定毫秒 */
  longPressMs: number;
  /** 长按右键倍速 */
  longPressSpeed: number;
  /** 长按左键每秒后退秒数 */
  rewindPerSec: number;
}

export const DEFAULT_VIDEO_SHORTCUTS: VideoShortcuts = {
  playPause: [" "],
  seekBack: ["ArrowLeft"],
  seekForward: ["ArrowRight"],
  prevVideo: ["["],
  nextVideo: ["]"],
  frameBack: [","],
  frameForward: ["."],
  markA: ["a"],
  markB: ["b"],
  toggleSubs: ["v"],
  capture: ["c"],
  close: ["Escape"],
  seekStep: 5,
  longPressMs: 200,
  longPressSpeed: 3,
  rewindPerSec: 8,
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  playPause: "播放 / 暂停",
  seekBack: "后退（点按）",
  seekForward: "前进（点按）",
  prevVideo: "上一个视频",
  nextVideo: "下一个视频",
  frameBack: "上一帧",
  frameForward: "下一帧",
  markA: "标记 A 点",
  markB: "标记 B 点",
  toggleSubs: "开关字幕",
  capture: "截取当前帧",
  close: "关闭播放器",
};

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  "playPause",
  "seekBack",
  "seekForward",
  "prevVideo",
  "nextVideo",
  "frameBack",
  "frameForward",
  "markA",
  "markB",
  "toggleSubs",
  "capture",
  "close",
];

/** Normalize KeyboardEvent to a stable shortcut string */
export function eventToShortcut(e: KeyboardEvent): string {
  if (e.key === " ") return " ";
  if (e.key.length === 1) return e.key.toLowerCase();
  return e.key;
}

export function shortcutDisplay(key: string): string {
  if (key === " ") return "Space";
  if (key === "ArrowLeft") return "←";
  if (key === "ArrowRight") return "→";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  if (key === "Escape") return "Esc";
  return key;
}

export function bindingDisplay(keys: KeyBinding): string {
  if (!keys.length) return "未绑定";
  return keys.map(shortcutDisplay).join(" / ");
}

function normalizeBinding(raw: unknown, fallback: KeyBinding): KeyBinding {
  if (Array.isArray(raw)) {
    const keys = raw
      .filter((k): k is string => typeof k === "string" && k.length > 0)
      .map((k) => (k.length === 1 ? k.toLowerCase() : k));
    return keys.length ? [...new Set(keys)] : [...fallback];
  }
  // 兼容旧版：单字符串
  if (typeof raw === "string" && raw.length > 0) {
    return [raw.length === 1 ? raw.toLowerCase() : raw];
  }
  return [...fallback];
}

export function parseShortcuts(raw: unknown): VideoShortcuts {
  if (!raw || typeof raw !== "object") {
    return structuredClone(DEFAULT_VIDEO_SHORTCUTS);
  }
  const o = raw as Record<string, unknown>;
  const bindings = Object.fromEntries(
    SHORTCUT_ACTIONS.map((k) => [k, normalizeBinding(o[k], DEFAULT_VIDEO_SHORTCUTS[k])])
  ) as Pick<VideoShortcuts, ShortcutAction>;

  return {
    ...bindings,
    seekStep: num(o.seekStep, DEFAULT_VIDEO_SHORTCUTS.seekStep),
    longPressMs: num(o.longPressMs, DEFAULT_VIDEO_SHORTCUTS.longPressMs),
    longPressSpeed: num(o.longPressSpeed, DEFAULT_VIDEO_SHORTCUTS.longPressSpeed),
    rewindPerSec: num(o.rewindPerSec, DEFAULT_VIDEO_SHORTCUTS.rewindPerSec),
  };
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function matchBinding(key: string, binding: KeyBinding): boolean {
  return binding.includes(key);
}

/** 某个键属于哪个行为（用于长按等） */
export function actionForKey(
  key: string,
  sc: VideoShortcuts
): ShortcutAction | null {
  for (const action of SHORTCUT_ACTIONS) {
    if (sc[action].includes(key)) return action;
  }
  return null;
}
