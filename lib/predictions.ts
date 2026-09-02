import type { LiveVehicle, StaticStop } from "./types";
import { haversineMeters } from "./geo";

export interface StopArrival {
  vehicleId: string;
  routeId: string;
  arrivalUnix: number | null;
  stopSequence: number;
}

/** All upcoming vehicle arrivals at a given stop, soonest first (unknown ETAs last). */
export function getUpcomingArrivalsForStop(stopId: string, vehicles: LiveVehicle[]): StopArrival[] {
  const results: StopArrival[] = [];
  for (const v of vehicles) {
    if (!v.routeId) continue;
    const match = v.nextStops.find((s) => s.stopId === stopId);
    if (!match) continue;
    results.push({
      vehicleId: v.vehicleId,
      routeId: v.routeId,
      arrivalUnix: match.arrivalUnix,
      stopSequence: match.stopSequence,
    });
  }
  return results.sort((a, b) => {
    if (a.arrivalUnix === null && b.arrivalUnix === null) return 0;
    if (a.arrivalUnix === null) return 1;
    if (b.arrivalUnix === null) return -1;
    return a.arrivalUnix - b.arrivalUnix;
  });
}

/** The nearest stop on a route to a given [lat, lon], with straight-line distance in meters. */
export function getNearestStopOnRoute(
  routeId: string,
  userLat: number,
  userLon: number,
  stops: StaticStop[]
): { stop: StaticStop; distanceMeters: number } | null {
  let best: { stop: StaticStop; distanceMeters: number } | null = null;
  for (const stop of stops) {
    if (!stop.routeIds.includes(routeId)) continue;
    const d = haversineMeters(userLat, userLon, stop.lat, stop.lon);
    if (!best || d < best.distanceMeters) {
      best = { stop, distanceMeters: d };
    }
  }
  return best;
}
