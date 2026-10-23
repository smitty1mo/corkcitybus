"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "corkcitybus:iconScale";
export const DEFAULT_ICON_SCALE = 1;
export const MIN_ICON_SCALE = 0.75;
export const MAX_ICON_SCALE = 3;

/** Persists the user's preferred bus icon/label size across visits. */
export function useIconScale() {
  const [scale, setScaleState] = useState(DEFAULT_ICON_SCALE);

  // Read the saved value after mount rather than in the initial useState, so
  // server-rendered and first-client-render markup always match (avoids a
  // hydration warning) - this trades a one-frame flash of the default size
  // for a previously-saved one, which is a fine tradeoff for an interactive,
  // client-only map widget.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved != null) {
        const parsed = parseFloat(saved);
        if (!Number.isNaN(parsed)) {
          setScaleState(Math.min(MAX_ICON_SCALE, Math.max(MIN_ICON_SCALE, parsed)));
        }
      }
    } catch {
      // localStorage can throw (private browsing, blocked storage) - keep the default.
    }
  }, []);

  function setScale(next: number) {
    setScaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Best-effort persistence only.
    }
  }

  return { scale, setScale };
}
