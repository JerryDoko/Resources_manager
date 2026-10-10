"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { NovelPlayback } from "./playback-controller";
export function useNovelPlayback(profileId:string,itemId:string,encoding:string,chapterId?:string) {
  const controller=useMemo(()=>new NovelPlayback(profileId,itemId),[profileId,itemId]);
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
  useEffect(()=>{controller.closed=false;void controller.load(encoding,chapterId);return()=>{controller.close();};},[controller,encoding,chapterId]);
  useEffect(()=>{const hide=()=>controller.close();window.addEventListener("pagehide",hide);return()=>window.removeEventListener("pagehide",hide);},[controller]);
  return {controller,state};
}
