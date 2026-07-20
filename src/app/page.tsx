"use client";

import { TitleBar } from "@/components/TitleBar";
import { Toolbar } from "@/components/Toolbar";
import { SeriesGrid } from "@/components/SeriesGrid";
import { CaptureCalendar } from "@/components/CaptureCalendar";

export default function Home() {
  return (
    <div className="min-h-screen">
      <TitleBar />
      <Toolbar />
      <CaptureCalendar />
      <SeriesGrid />
    </div>
  );
}
