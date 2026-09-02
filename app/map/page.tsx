"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-neutral-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-cork-red border-t-transparent" />
        <p className="text-sm text-neutral-400">Loading map…</p>
      </div>
    </div>
  ),
});

export default function MapPage() {
  return <MapView />;
}
