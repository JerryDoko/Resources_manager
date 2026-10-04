export {};

declare global {
  interface Window {
    rmDesktop?: {
      isElectron: boolean;
      platform: string;
      close: () => void;
      minimize: () => void;
      toggleMaximize?: () => void;
      isMaximized?: () => Promise<boolean>;
      onMaximizedChange?: (callback: (maximized: boolean) => void) => () => void;
      toggleFullscreen: () => void;
      isFullScreen?: () => Promise<boolean>;
      chooseFolder?: (prompt?: string) => Promise<string | null>;
      chooseNovel?: () => Promise<string | null>;
      revealItem?: (targetPath: string) => Promise<boolean>;
      onFullscreenChange?: (callback: (fullscreen: boolean) => void) => () => void;
    };
  }
}
