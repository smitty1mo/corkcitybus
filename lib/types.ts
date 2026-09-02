// Static GTFS (bundled at build time, see scripts/build-gtfs-data.mjs)

export interface StaticRoute {
  id: string;
  shortName: string;
  longName: string;
}

export interface StaticStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  routeIds: string[];
}

export interface StaticShape {
  shapeId: string;
  routeId: string;
  directionId: string;
  headsign: string;
  points: [number, number][]; // [lat, lon]
}

export interface RoutePatternStop {
  stopId: string;
  /** Scheduled seconds after the trip's start_time that this stop is reached. */
  offsetSec: number;
}

export interface RoutePattern {
  routeId: string;
  directionId: string;
  stops: RoutePatternStop[];
}

export interface CorkStaticData {
  generatedAt: string;
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  routes: StaticRoute[];
  stops: StaticStop[];
  shapes: StaticShape[];
  routePatterns: RoutePattern[];
}

// Live data (from /api/live, derived from GTFS-Realtime)

export interface LiveVehicle {
  vehicleId: string;
  tripId: string | null;
  routeId: string | null;
  lat: number;
  lon: number;
  bearing: number | null;
  speed: number | null;
  timestamp: number; // unix seconds, when the vehicle reported this position
  currentStopSequence: number | null;
  currentStopId: string | null;
  /** Predicted arrival at the next few stops, from the TripUpdates feed, when available. */
  nextStops: PredictedStopArrival[];
}

export interface PredictedStopArrival {
  stopId: string;
  stopSequence: number;
  arrivalUnix: number | null;
  departureUnix: number | null;
}

export type Selection =
  | { type: "bus"; vehicleId: string }
  | { type: "stop"; stopId: string }
  | { type: "route"; routeId: string }
  | null;

export interface LiveFeedResponse {
  fetchedAt: number; // unix seconds - when this payload was produced
  lastSuccessAt: number; // unix seconds - when live data was last fetched successfully from NTA
  stale: boolean; // true if the current payload is a previously cached success (live fetch just failed)
  error: string | null;
  vehicles: LiveVehicle[];
}
