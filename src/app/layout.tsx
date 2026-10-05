import type { Metadata } from "next";
import { LibraryProvider } from "@/lib/store";
import { SettingsPanel } from "@/components/SettingsPanel";
import { UpdateNotifier } from "@/components/update/UpdateNotifier";
import { AiConfirmationPrompt } from "@/components/ai/AiConfirmationPrompt";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resources Manager",
  description:
    "本地一体化资源管理器 — 漫画、条漫、小说、视频与照片。私有离线、自动索引与系列归组、标签评分、本地阅读与播放。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-transparent">
        <LibraryProvider>
          {children}
          <SettingsPanel />
          <AiConfirmationPrompt />
          <UpdateNotifier />
        </LibraryProvider>
      </body>
    </html>
  );
}
