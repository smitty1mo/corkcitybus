"use client";

import { useState } from "react";
import type { StaticRoute } from "@/lib/types";

export default function RouteFilterSheet({
  routes,
  colors,
  selected,
  activeRouteIds,
  onChange,
}: {
  routes: StaticRoute[];
  colors: Record<string, string>;
  selected: Set<string>;
  activeRouteIds: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);

  const allSelected = selected.size === routes.length;

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function toggleAll() {
    onChange(allSelected ? new Set() : new Set(routes.map((r) => r.id)));
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-[14px] font-semibold text-neutral-800 shadow-card backdrop-blur active:scale-95 transition-transform"
      >
        <FilterGlyph className="h-4 w-4 text-cork-red" />
        Routes
        <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-semibold text-neutral-500">
          {selected.size}/{routes.length}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <button
            aria-label="Close route filter"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30 animate-fade-in"
          />
          <div className="relative z-10 flex max-h-[75dvh] flex-col rounded-t-[24px] bg-white shadow-sheet animate-slide-up">
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
              <h2 className="text-[17px] font-bold text-neutral-900">Routes</h2>
              <button
                onClick={toggleAll}
                className="text-[14px] font-semibold text-cork-red active:opacity-60"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="momentum-scroll flex-1 overflow-y-auto px-3 pb-3">
              {routes.map((r) => {
                const isSelected = selected.has(r.id);
                const isActive = activeRouteIds.has(r.id);
                return (
                  <label
                    key={r.id}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5 active:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(r.id)}
                      className="peer sr-only"
                    />
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
                      style={{
                        borderColor: isSelected ? colors[r.id] : "#D1D1D6",
                        backgroundColor: isSelected ? colors[r.id] : "transparent",
                      }}
                    >
                      {isSelected && (
                        <svg viewBox="0 0 12 10" className="h-2.5 w-3 fill-none">
                          <path
                            d="M1 5L4.5 8.5L11 1"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      className="flex h-6 min-w-[2.25rem] items-center justify-center rounded-md px-1.5 text-[12px] font-bold text-white"
                      style={{ backgroundColor: colors[r.id] }}
                    >
                      {r.shortName}
                    </span>
                    <span className="flex-1 truncate text-[14px] text-neutral-700">
                      {r.longName}
                    </span>
                    {isActive && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" title="Buses active" />
                    )}
                  </label>
                );
              })}
            </div>
            <div className="border-t border-neutral-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => setOpen(false)}
                className="w-full rounded-2xl bg-neutral-900 py-3 text-[15px] font-semibold text-white active:scale-[0.98] transition-transform"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FilterGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M3 5h14M6 10h8M9 15h2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
