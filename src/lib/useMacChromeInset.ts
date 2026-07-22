"use client";

import { useAppChrome } from "@/lib/useAppChrome";

/** @deprecated 使用 useAppChrome */
export function useMacChromeInset() {
  const { mac, viewerHeaderClass } = useAppChrome();
  return { mac, viewerHeaderClass, viewerSafeTop: viewerHeaderClass };
}
