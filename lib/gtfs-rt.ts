import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { getCorkRouteIds, getRoutePattern, getStopCoords, loadCorkStaticData } from "./gtfs-static-server";
import { isNearDepot, haversineMeters } from "./geo";
import type { LiveVehicle, PredictedStopArrival } from "./types";

const VEHICLE_POSITIONS_URL = "https://api.nationaltransport.ie/gtfsr/v2/Vehicles";
const TRIP_UPDATES_URL = "https://api.nationaltransport.ie/gtfsr/v2/TripUpdates";

// The NTA feed reports stop_time_update as a schedule *delay* in seconds
// rather than an absolute predicted time, and we don't bundle full per-trip
// static schedules (they run to ~90MB for Cork alone - too big for a
// serverless function). Reconstructing an absolute time from delay +
// bundled representative-pattern offsets turned out to be unreliable in
// practice (different trips on the same route/direction can be distinct
// branch variants whose stops don't share the same *relative* timing), so
// instead we estimate ETA from the vehicle's live position: cumulative
// straight-line distance along the upcoming stop sequence, divided by a
// speed estimate. Simple, has no timezone/schedule-matching failure mode,
// and is the standard fallback used by transit apps when a feed doesn't
// give absolute predictions.
const DEFAULT_SPEED_MPS = 6; // ~21.6 km/h, a reasonable in-service city bus pace
const MAX_SPEED_MPS = 14; // ~50 km/h cap, so a momentary fast GPS reading doesn't produce a too-short ETA
const MIN_MOVING_SPEED_MPS = 2; // below this, treat the bus as stopped/idling and use the default pace instead

function toUnixSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  // protobufjs Long-like object
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return null;
}

async function fetchProtobuf(url: string, apiKey: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { "x-api-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status} ${res.statusText}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

interface TripUpdateInfo {
  routeId: string | null;
  /** Upcoming stops in order, with an absolute time only when the feed actually gave one. */
  stops: { stopId: string; stopSequence: number; absoluteArrivalUnix: number | null }[];
}

async function fetchTripUpdates(apiKey: string): Promise<Map<string, TripUpdateInfo>> {
  const bytes = await fetchProtobuf(TRIP_UPDATES_URL, apiKey);
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
  const corkRouteIds = getCorkRouteIds();
  const byTrip = new Map<string, TripUpdateInfo>();

  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu || !tu.trip) continue;
    const tripId = tu.trip.tripId ?? null;
    const routeId = tu.trip.routeId ?? null;
    if (!tripId) continue;
    if (routeId && !corkRouteIds.has(routeId)) continue;

    // A stop_time_update with no `arrival` field at all (only `departure`) is
    // the NTA feed's way of reporting the just-departed stop for delay
    // tracking - skip it so we don't show an already-passed stop as "next".
    const stops = (tu.stopTimeUpdate ?? [])
      .filter((stu) => stu.arrival != null)
      .map((stu) => {
        const t = toUnixSeconds(stu.arrival?.time);
        return {
          stopId: stu.stopId ?? "",
          stopSequence: stu.stopSequence ?? -1,
          absoluteArrivalUnix: t && t > 0 ? t : null,
        };
      });

    byTrip.set(tripId, { routeId, stops });
  }

  return byTrip;
}

function estimatedSpeed(reportedSpeedMps: number | null | undefined): number {
  if (reportedSpeedMps != null && reportedSpeedMps > MIN_MOVING_SPEED_MPS) {
    return Math.min(reportedSpeedMps, MAX_SPEED_MPS);
  }
  return DEFAULT_SPEED_MPS;
}

function resolveNextStops(
  routeId: string,
  directionId: string,
  currentStopSequence: number | null,
  currentStopId: string | null,
  tripUpdate: TripUpdateInfo | undefined,
  vehicleLat: number,
  vehicleLon: number,
  vehicleSpeed: number | null,
  nowUnix: number
): PredictedStopArrival[] {
  let upcoming: { stopId: string; stopSequence: number; absoluteArrivalUnix: number | null }[];

  if (tripUpdate && tripUpdate.stops.length > 0) {
    upcoming = tripUpdate.stops;
  } else {
    const pattern = getRoutePattern(routeId, directionId);
    if (!pattern || pattern.stops.length === 0) return [];
    let startIdx = 0;
    if (currentStopId) {
      const idx = pattern.stops.findIndex((s) => s.stopId === currentStopId);
      if (idx >= 0) startIdx = idx;
    } else if (currentStopSequence !== null) {
      startIdx = Math.max(0, Math.min(pattern.stops.length - 1, currentStopSequence - 1));
    }
    upcoming = pattern.stops
      .slice(startIdx)
      .map((s, i) => ({ stopId: s.stopId, stopSequence: startIdx + i + 1, absoluteArrivalUnix: null }));
  }

  const stopCoords = getStopCoords();
  const speedMps = estimatedSpeed(vehicleSpeed);

  let cumulativeMeters = 0;
  let prevLat = vehicleLat;
  let prevLon = vehicleLon;
  const results: PredictedStopArrival[] = [];

  for (const s of upcoming.slice(0, 5)) {
    const coords = stopCoords.get(s.stopId);
    if (coords) {
      cumulativeMeters += haversineMeters(prevLat, prevLon, coords.lat, coords.lon);
      prevLat = coords.lat;
      prevLon = coords.lon;
    }
    const estimatedArrival = Math.round(nowUnix + cumulativeMeters / speedMps);
    results.push({
      stopId: s.stopId,
      stopSequence: s.stopSequence,
      arrivalUnix: s.absoluteArrivalUnix ?? estimatedArrival,
      departureUnix: null,
    });
  }

  return results;
}

export async function fetchAndFilterCorkVehicles(apiKey: string): Promise<LiveVehicle[]> {
  const [vehicleBytes, tripUpdates] = await Promise.all([
    fetchProtobuf(VEHICLE_POSITIONS_URL, apiKey),
    fetchTripUpdates(apiKey).catch(() => new Map<string, TripUpdateInfo>()),
  ]);

  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(vehicleBytes);
  const corkRouteIds = getCorkRouteIds();
  const { bbox } = loadCorkStaticData();
  const nowUnix = Math.floor(Date.now() / 1000);

  const vehicles: LiveVehicle[] = [];

  for (const entity of feed.entity) {
    const v = entity.vehicle;
    if (!v || !v.position) continue;

    const routeId = v.trip?.routeId ?? null;
    const lat = v.position.latitude;
    const lon = v.position.longitude;

    if (!routeId || !corkRouteIds.has(routeId)) continue;
    if (lat < bbox.minLat || lat > bbox.maxLat || lon < bbox.minLon || lon > bbox.maxLon) continue;
    if (isNearDepot(lat, lon)) continue;

    const tripId = v.trip?.tripId ?? null;
    const directionId = v.trip?.directionId != null ? String(v.trip.directionId) : "0";
    const currentStopSequence = v.currentStopSequence ?? null;
    const currentStopId = v.stopId ?? null;
    const timestamp = toUnixSeconds(v.timestamp) ?? nowUnix;
    const speed = v.position.speed ?? null;

    const tripUpdate = tripId ? tripUpdates.get(tripId) : undefined;
    const nextStops = resolveNextStops(
      routeId,
      directionId,
      currentStopSequence,
      currentStopId,
      tripUpdate,
      lat,
      lon,
      speed,
      nowUnix
    );

    vehicles.push({
      vehicleId: v.vehicle?.id ?? entity.id,
      tripId,
      routeId,
      lat,
      lon,
      bearing: v.position.bearing ?? null,
      speed,
      timestamp,
      currentStopSequence,
      currentStopId,
      nextStops,
    });
  }

  return vehicles;
}
