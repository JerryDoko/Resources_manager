"use client";

import { useEffect, useState } from "react";

/** 窗口模式 / 全屏下的顶栏占位（macOS 交通灯） */
export function useAppChrome() {
  const [mac, setMac] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setMac(
      !!window.rmDesktop?.isElectron && window.rmDesktop.platform === "darwin"
    );

    const apply = (value: boolean) => setFullscreen(value);

    const onDocFs = () => apply(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onDocFs);

    let detach: (() => void) | undefined;
    if (window.rmDesktop?.onFullscreenChange) {
      detach = window.rmDesktop.onFullscreenChange(apply);
      window.rmDesktop.isFullScreen?.().then(apply).catch(() => {});
    }

    return () => {
      document.removeEventListener("fullscreenchange", onDocFs);
      detach?.();
    };
  }, []);

  const showTitlebarChrome = mac && !fullscreen;

  return {
    mac,
    fullscreen,
    showTitlebarChrome,
    /** 顶栏（品牌 + 标签）顶部留白 */
    titlebarPadClass: showTitlebarChrome ? "pt-9" : "pt-2",
    /** 全屏查看器顶栏 */
    viewerHeaderClass: showTitlebarChrome ? "pt-9 pl-[76px]" : "pt-3",
  };
}
