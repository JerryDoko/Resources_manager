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
      onFullscreenChange?: (callback: (fullscreen: boolean) => void) => () => void;
    };
  }
}
