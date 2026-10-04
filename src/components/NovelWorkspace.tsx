"use client";
import { useEffect, useState } from "react";
import { NovelReader } from "./viewers/NovelReader";
import type { OpenNovel } from "@/lib/novel/open-reader";
export function NovelWorkspace() {
  const [book, setBook] = useState<OpenNovel | null>(null);
  useEffect(() => {
    const open = (event: Event) => setBook((event as CustomEvent<OpenNovel>).detail);
    window.addEventListener("rm:open-novel", open);
    return () => window.removeEventListener("rm:open-novel", open);
  }, []);
  return book ? <NovelReader key={book.itemId} {...book} onClose={() => {setBook(null);window.dispatchEvent(new Event("rm:novel-library-changed"));}} /> : null;
}
