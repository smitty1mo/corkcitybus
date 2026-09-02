"use client";

import { useEffect, useState } from "react";
import type { CorkStaticData } from "./types";

let cachedPromise: Promise<CorkStaticData> | null = null;

function loadStaticData(): Promise<CorkStaticData> {
  if (!cachedPromise) {
    cachedPromise = fetch("/data/cork-static.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load static data: ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        cachedPromise = null; // allow retry on next call
        throw err;
      });
  }
  return cachedPromise;
}

export function useStaticData() {
  const [data, setData] = useState<CorkStaticData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadStaticData()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load map data");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
