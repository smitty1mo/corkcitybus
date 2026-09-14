import fs from "node:fs";
import path from "node:path";
import type { CorkStaticData, RoutePattern } from "./types";

let cached: CorkStaticData | null = null;

/** Loads the bundled Cork GTFS dataset once per server instance (module-scope cache). */
export function loadCorkStaticData(): CorkStaticData {
  if (cached) return cached;
  const filePath = path.join(process.cwd(), "public", "data", "cork-static.json");
  const raw = fs.readFileSync(filePath, "utf8");
  cached = JSON.parse(raw) as CorkStaticData;
  return cached;
}

let corkRouteIdsCache: Set<string> | null = null;

export function getCorkRouteIds(): Set<string> {
  if (!corkRouteIdsCache) {
    corkRouteIdsCache = new Set(loadCorkStaticData().routes.map((r) => r.id));
  }
  return corkRouteIdsCache;
}

let stopCoordsCache: Map<string, { lat: number; lon: number }> | null = null;

export function getStopCoords(): Map<string, { lat: number; lon: number }> {
  if (!stopCoordsCache) {
    stopCoordsCache = new Map(
      loadCorkStaticData().stops.map((s) => [s.id, { lat: s.lat, lon: s.lon }])
    );
  }
  return stopCoordsCache;
}

let patternByIdCache: Map<string, RoutePattern> | null = null;
let defaultPatternByRouteDirCache: Map<string, RoutePattern> | null = null;

function ensurePatternIndexes(): void {
  if (patternByIdCache && defaultPatternByRouteDirCache) return;
  const data = loadCorkStaticData();
  patternByIdCache = new Map();
  defaultPatternByRouteDirCache = new Map();
  for (const p of data.routePatterns) {
    patternByIdCache.set(p.patternId, p);
    // routePatterns lists each (routeId, directionId)'s variants most-used
    // first (see build-gtfs-data.mjs), so the first one seen per key is the
    // best default when a specific trip's exact pattern isn't known.
    const key = `${p.routeId}|${p.directionId}`;
    if (!defaultPatternByRouteDirCache.has(key)) defaultPatternByRouteDirCache.set(key, p);
  }
}

/**
 * The exact stop-sequence variant a specific trip follows, when we have
 * static schedule data for it - a route/direction can have several distinct
 * variants (branch skips, short-workings), so this is the reliable path.
 */
export function getPatternForTrip(tripId: string): RoutePattern | undefined {
  ensurePatternIndexes();
  const patternId = loadCorkStaticData().tripPatterns[tripId];
  if (!patternId) return undefined;
  return patternByIdCache!.get(patternId);
}

/** The most common stop-sequence variant for a (routeId, directionId) pair - a
 * fallback for when the live trip_id isn't found in the bundled static data. */
export function getRoutePattern(routeId: string, directionId: string): RoutePattern | undefined {
  ensurePatternIndexes();
  return defaultPatternByRouteDirCache!.get(`${routeId}|${directionId}`);
}
