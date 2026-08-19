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
      onFullscreenChange?: (callback: (fullscreen: boolean) => void) => () => void;
    };
  }
}
