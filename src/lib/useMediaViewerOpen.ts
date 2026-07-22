"use client";

import { useEffect, useState } from "react";

/** 是否处于全屏媒体查看器（图片 / 视频等） */
export function useMediaViewerOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setOpen(document.body.dataset.rmViewer === "1");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ["data-rm-viewer"] });
    return () => obs.disconnect();
  }, []);

  return open;
}
