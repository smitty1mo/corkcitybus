/** Shared between server (lib/gtfs-rt.ts) and client (lib/useLiveVehicles.ts). */

/** A vehicle's last position report older than this is shown as "(no connection)". */
export const STALE_VEHICLE_AFTER_SECONDS = 180;

/** Client poll interval for our own cached /api/live endpoint (server itself
 * only hits NTA at most once per 61s - this just controls how quickly the
 * UI notices a refreshed cache). */
export const CLIENT_POLL_INTERVAL_MS = 20_000;

/** Mirrors the bbox baked into public/data/cork-static.json - kept here too
 * so the map can lock its pan/zoom bounds before that fetch resolves. */
export const CORK_MAP_BBOX = { minLat: 51.79, maxLat: 51.97, minLon: -8.62, maxLon: -8.35 };
