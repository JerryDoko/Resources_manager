export interface OpenNovel { itemId: string; title: string; chapterId?: string }
export function openNovel(book: OpenNovel) {
  window.dispatchEvent(new CustomEvent<OpenNovel>("rm:open-novel", { detail: book }));
}
