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

let patternIndexCache: Map<string, RoutePattern> | null = null;

/** Ordered stops (with scheduled offset seconds) for a (routeId, directionId) pair. */
export function getRoutePattern(routeId: string, directionId: string): RoutePattern | undefined {
  if (!patternIndexCache) {
    const data = loadCorkStaticData();
    patternIndexCache = new Map();
    for (const p of data.routePatterns) {
      patternIndexCache.set(`${p.routeId}|${p.directionId}`, p);
    }
  }
  return patternIndexCache.get(`${routeId}|${directionId}`);
}
