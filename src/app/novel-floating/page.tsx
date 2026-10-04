"use client";
import { useEffect } from "react";

export default function FloatingNovelPage(){
  useEffect(()=>{
    // The parent may mount its portal only after this page has hydrated.
    window.opener?.postMessage({type:"rm-novel-floating-ready"},window.location.origin);
  },[]);
  return <div id="novel-floating-host"/>;
}
