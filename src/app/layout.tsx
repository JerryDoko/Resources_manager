import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import { LibraryProvider } from "@/lib/store";
import { SettingsPanel } from "@/components/SettingsPanel";
import { MusicDock } from "@/components/MusicDock";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resources Manager",
  description:
    "本地一体化资源管理器 — 漫画、条漫、小说、视频、音乐与照片。私有离线、自动索引与系列归组、标签评分、本地阅读与播放。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${fraunces.variable} ${dmSans.variable} antialiased`}>
        <LibraryProvider>
          {children}
          <SettingsPanel />
          <MusicDock />
        </LibraryProvider>
      </body>
    </html>
  );
}
