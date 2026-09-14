import type { LiveVehicle, StaticStop } from "./types";
import { haversineMeters } from "./geo";

export interface StopArrival {
  vehicleId: string;
  routeId: string;
  arrivalUnix: number | null;
  stopSequence: number;
}

// Keep each stop's forecast short and reliable: a handful of near-term
// arrivals rather than an ever-growing, increasingly speculative list.
const MAX_STOP_ARRIVALS = 4;
const MAX_LOOKAHEAD_SEC = 30 * 60;

/**
 * Upcoming vehicle arrivals at a given stop within the next 30 minutes,
 * soonest first (max 4). Pass `filterRouteId` to look at just one route's
 * arrivals - it's applied before the 4-arrival cap, so a single route's bus
 * is never crowded out by other routes serving the same stop.
 */
export function getUpcomingArrivalsForStop(
  stopId: string,
  vehicles: LiveVehicle[],
  nowUnix: number = Math.floor(Date.now() / 1000),
  filterRouteId?: string
): StopArrival[] {
  const results: StopArrival[] = [];
  for (const v of vehicles) {
    if (!v.routeId) continue;
    if (filterRouteId && v.routeId !== filterRouteId) continue;
    const match = v.nextStops.find((s) => s.stopId === stopId);
    if (!match) continue;
    if (match.arrivalUnix !== null) {
      if (match.arrivalUnix < nowUnix - 60) continue; // already passed
      if (match.arrivalUnix - nowUnix > MAX_LOOKAHEAD_SEC) continue; // too far out to forecast reliably
    }
    results.push({
      vehicleId: v.vehicleId,
      routeId: v.routeId,
      arrivalUnix: match.arrivalUnix,
      stopSequence: match.stopSequence,
    });
  }
  results.sort((a, b) => {
    if (a.arrivalUnix === null && b.arrivalUnix === null) return 0;
    if (a.arrivalUnix === null) return 1;
    if (b.arrivalUnix === null) return -1;
    return a.arrivalUnix - b.arrivalUnix;
  });
  return results.slice(0, MAX_STOP_ARRIVALS);
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
