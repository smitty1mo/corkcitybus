"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { MAX_ICON_SCALE, MIN_ICON_SCALE } from "@/lib/useIconScale";

const STEP = 0.05;

export default function SettingsSheet({
  scale,
  onChange,
}: {
  scale: number;
  onChange: (next: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Settings"
        className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-neutral-700 shadow-card backdrop-blur active:scale-95 transition-transform"
      >
        <AdjustGlyph className="h-5 w-5" />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-40 flex flex-col justify-end">
            <button
              aria-label="Close settings"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/30 animate-fade-in"
            />
            <div className="relative z-10 flex flex-col rounded-t-[24px] bg-white shadow-sheet animate-slide-up">
              <div className="px-5 pb-1 pt-4">
                <h2 className="text-[17px] font-bold text-neutral-900">Settings</h2>
              </div>

              <div className="px-5 pb-2 pt-3">
                <p className="text-[13px] font-semibold text-neutral-700">Bus &amp; label size</p>
                <p className="mt-0.5 text-[12.5px] text-neutral-500">
                  Scales bus icons and their route numbers on the map together, so they&rsquo;re
                  readable whether you need them small and precise or big enough to read without
                  glasses.
                </p>

                <div className="mt-5 flex items-center justify-center py-2">
                  <div
                    aria-hidden
                    className="flex h-7 w-10 shrink-0 items-center justify-center rounded-lg bg-cork-red text-[11px] font-bold text-white transition-transform"
                    style={{ transform: `scale(${scale})` }}
                  >
                    220
                  </div>
                </div>

                <input
                  type="range"
                  min={MIN_ICON_SCALE}
                  max={MAX_ICON_SCALE}
                  step={STEP}
                  value={scale}
                  onChange={(e) => onChange(parseFloat(e.target.value))}
                  className="mt-5 w-full accent-cork-red"
                  aria-label="Bus and label size"
                />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-neutral-400">
                  <span>Smaller</span>
                  <span className="text-[12px] font-semibold text-neutral-600">
                    {scale.toFixed(2)}×
                  </span>
                  <span>Larger</span>
                </div>
              </div>

              <div className="mt-2 border-t border-neutral-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  onClick={() => setOpen(false)}
                  className="w-full rounded-2xl bg-neutral-900 py-3 text-[15px] font-semibold text-white active:scale-[0.98] transition-transform"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function AdjustGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <line x1="3" y1="6" x2="17" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12.5" cy="6" r="2.2" fill="currentColor" />
      <line x1="3" y1="14" x2="17" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="7.5" cy="14" r="2.2" fill="currentColor" />
    </svg>
  );
}
