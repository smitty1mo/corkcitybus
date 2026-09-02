"use client";

import { formatClockTime } from "@/lib/eta";

export default function StatusBanner({
  lastSuccessAt,
}: {
  lastSuccessAt: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-neutral-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-card backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Showing last known positions
        {lastSuccessAt > 0 && (
          <span className="text-neutral-300">· {formatClockTime(lastSuccessAt)}</span>
        )}
      </div>
    </div>
  );
}
