import type {NovelAudioDownload} from "../lib/novel/export-notices";
export {};

declare global {
  interface Window {
    rmDesktop?: {
      isElectron: boolean;
      platform: string;
      close: () => void;
      minimize: () => void;
      toggleFullscreen: () => void;
      isFullScreen?: () => Promise<boolean>;
      chooseFolder?: (prompt?: string) => Promise<string | null>;
      chooseNovel?: () => Promise<string | null>;
      revealItem?: (targetPath: string) => Promise<boolean>;
      onNovelAudioDownload?: (callback: (download: NovelAudioDownload) => void) => () => void;
      onFullscreenChange?: (callback: (fullscreen: boolean) => void) => () => void;
    };
  }
}
