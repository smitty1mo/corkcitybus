"use client";

import { useEffect, useState } from "react";

export type GeoStatus = "prompt" | "granted" | "denied" | "unsupported";

export interface GeoState {
  status: GeoStatus;
  position: { lat: number; lon: number } | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: "prompt", position: null });

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setState({ status: "unsupported", position: null });
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          status: "granted",
          position: { lat: pos.coords.latitude, lon: pos.coords.longitude },
        });
      },
      (err) => {
        setState((s) => ({
          status: err.code === err.PERMISSION_DENIED ? "denied" : s.status,
          position: s.position,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 10_000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return state;
}
