"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveFeedResponse, LiveVehicle } from "./types";
import { CLIENT_POLL_INTERVAL_MS } from "./constants";

export interface VehicleFix {
  lat: number;
  lon: number;
  bearing: number | null;
  /** When the vehicle itself reported this fix (unix seconds) - used only for staleness. */
  vehicleTimestamp: number;
  /** When *this client* received the fix (unix seconds, Date.now()/1000) - the actual
   * animation clock. By the time a fix reaches the browser, NTA's own reporting lag
   * plus our 61s server throttle plus the client poll interval can already exceed the
   * gap between two consecutive vehicleTimestamps, so interpolating against
   * vehicleTimestamp made every update arrive already-in-the-past (t clamped to 1
   * immediately - the bus would snap instead of glide). Interpolating against
   * receivedAt instead guarantees a real window to animate through. */
  receivedAt: number;
}

export interface VehicleAnim {
  prev: VehicleFix;
  curr: VehicleFix;
  vehicle: LiveVehicle;
}

export interface LiveMeta {
  lastSuccessAt: number;
  stale: boolean;
  error: string | null;
  loaded: boolean;
}

export function useLiveVehicles() {
  const [meta, setMeta] = useState<LiveMeta>({
    lastSuccessAt: 0,
    stale: false,
    error: null,
    loaded: false,
  });
  const animRef = useRef<Map<string, VehicleAnim>>(new Map());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) throw new Error(`Live feed request failed (${res.status})`);
        const data: LiveFeedResponse = await res.json();
        if (cancelled) return;

        const map = animRef.current;
        const seen = new Set<string>();
        const receivedAt = Date.now() / 1000;
        for (const v of data.vehicles) {
          seen.add(v.vehicleId);
          const existing = map.get(v.vehicleId);
          if (!existing || existing.curr.vehicleTimestamp !== v.timestamp) {
            map.set(v.vehicleId, {
              prev: existing
                ? existing.curr
                : { lat: v.lat, lon: v.lon, bearing: v.bearing, vehicleTimestamp: v.timestamp, receivedAt: receivedAt - 1 },
              curr: { lat: v.lat, lon: v.lon, bearing: v.bearing, vehicleTimestamp: v.timestamp, receivedAt },
              vehicle: v,
            });
          } else {
            map.set(v.vehicleId, { ...existing, vehicle: v });
          }
        }
        for (const id of Array.from(map.keys())) {
          if (!seen.has(id)) map.delete(id);
        }

        setMeta({
          lastSuccessAt: data.lastSuccessAt,
          stale: data.stale,
          error: data.error,
          loaded: true,
        });
        setVersion((v) => v + 1);
      } catch (err) {
        if (!cancelled) {
          setMeta((m) => ({
            ...m,
            loaded: true,
            error: err instanceof Error ? err.message : "Network error fetching live buses",
          }));
        }
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, CLIENT_POLL_INTERVAL_MS);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { animRef, meta, version };
}
