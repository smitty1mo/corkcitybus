// One-off processing script that builds the bundled Cork GTFS dataset from
// the full Bus Éireann static GTFS feed. Not run at request time or at
// Vercel build/deploy time - the output (public/data/cork-static.json) is
// committed to the repo and only needs regenerating when NTA reissues
// static GTFS with route/stop changes.
//
// Usage:
//   1. Download & unzip https://www.transportforireland.ie/transitData/Data/GTFS_Bus_Eireann.zip
//   2. node scripts/build-gtfs-data.mjs <path-to-extracted-gtfs> public/data
import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";

const SRC = process.argv[2];
const OUT = process.argv[3] ?? "public/data";

if (!SRC) {
  console.error("Usage: node scripts/build-gtfs-data.mjs <path-to-extracted-gtfs> [outDir]");
  process.exit(1);
}

const CORK_BBOX = { minLat: 51.79, maxLat: 51.97, minLon: -8.62, maxLon: -8.35 };

function inBbox(lat, lon) {
  return (
    lat >= CORK_BBOX.minLat &&
    lat <= CORK_BBOX.maxLat &&
    lon >= CORK_BBOX.minLon &&
    lon <= CORK_BBOX.maxLon
  );
}

function isCorkCityRouteNumber(shortName) {
  const m = /^(\d{3})([A-Z]{0,2})$/.exec(shortName);
  if (!m) return false;
  const num = parseInt(m[1], 10);
  return num >= 201 && num <= 226;
}

// Douglas-Peucker polyline simplification (tolerance in degrees, ~5m ~= 0.00005 deg at this latitude)
function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  function perpDist(p, a, b) {
    const [ay, ax] = a;
    const [by, bx] = b;
    const [py, px] = p;
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
  }
  function dp(pts) {
    if (pts.length <= 2) return pts;
    let maxDist = -1;
    let idx = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (maxDist > tolerance) {
      const left = dp(pts.slice(0, idx + 1));
      const right = dp(pts.slice(idx));
      return left.slice(0, -1).concat(right);
    }
    return [pts[0], pts[pts.length - 1]];
  }
  return dp(points);
}

function round(n, dp) {
  const f = Math.pow(10, dp);
  return Math.round(n * f) / f;
}

async function readCsv(filePath, onRow) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    if (!header) {
      header = line.split(",");
      continue;
    }
    const cols = line.split(",");
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cols[i] ?? "";
    onRow(row);
  }
}

async function main() {
  console.log("Reading agency.txt / routes.txt ...");
  const routesRaw = [];
  await readCsv(path.join(SRC, "routes.txt"), (row) => routesRaw.push(row));

  const candidateRoutes = routesRaw.filter(
    (r) => r.agency_id === "2" && isCorkCityRouteNumber(r.route_short_name)
  );
  const candidateRouteIds = new Set(candidateRoutes.map((r) => r.route_id));
  console.log(`Candidate Cork routes (by number 201-226): ${candidateRoutes.length}`);

  console.log("Reading stops.txt ...");
  const stopsById = new Map();
  await readCsv(path.join(SRC, "stops.txt"), (row) => {
    stopsById.set(row.stop_id, {
      id: row.stop_id,
      code: row.stop_code,
      name: row.stop_name,
      lat: parseFloat(row.stop_lat),
      lon: parseFloat(row.stop_lon),
    });
  });
  console.log(`Total stops in feed: ${stopsById.size}`);

  console.log("Reading trips.txt (streaming, filtering to candidate routes) ...");
  const tripsById = new Map();
  const shapeIdsByRoute = new Map();
  await readCsv(path.join(SRC, "trips.txt"), (row) => {
    if (!candidateRouteIds.has(row.route_id)) return;
    tripsById.set(row.trip_id, {
      tripId: row.trip_id,
      routeId: row.route_id,
      shapeId: row.shape_id,
      headsign: row.trip_headsign,
      directionId: row.direction_id,
    });
    if (!shapeIdsByRoute.has(row.route_id)) shapeIdsByRoute.set(row.route_id, new Set());
    shapeIdsByRoute.get(row.route_id).add(row.shape_id);
  });
  console.log(`Candidate trips: ${tripsById.size}`);

  console.log("Reading stop_times.txt (streaming, this is the big one) ...");
  const stopTimesByTrip = new Map();
  const stopUsageByRoute = new Map();
  let stCount = 0;
  await readCsv(path.join(SRC, "stop_times.txt"), (row) => {
    const trip = tripsById.get(row.trip_id);
    if (!trip) return;
    stCount++;
    if (!stopTimesByTrip.has(row.trip_id)) stopTimesByTrip.set(row.trip_id, []);
    stopTimesByTrip.get(row.trip_id).push({
      stopId: row.stop_id,
      seq: parseInt(row.stop_sequence, 10),
      arr: row.arrival_time,
      dep: row.departure_time,
    });
    if (!stopUsageByRoute.has(trip.routeId)) stopUsageByRoute.set(trip.routeId, new Set());
    stopUsageByRoute.get(trip.routeId).add(row.stop_id);
  });
  console.log(`Filtered stop_times rows: ${stCount}`);

  // Validate each candidate route actually operates mostly within the Cork bbox
  const finalRouteIds = new Set();
  for (const r of candidateRoutes) {
    const stopIds = stopUsageByRoute.get(r.route_id);
    if (!stopIds || stopIds.size === 0) continue;
    let inside = 0;
    for (const sid of stopIds) {
      const s = stopsById.get(sid);
      if (s && inBbox(s.lat, s.lon)) inside++;
    }
    const fraction = inside / stopIds.size;
    if (fraction >= 0.6) {
      finalRouteIds.add(r.route_id);
    } else {
      console.log(
        `  dropping ${r.route_short_name} (${r.route_id}): only ${(fraction * 100).toFixed(0)}% of stops in bbox`
      );
    }
  }
  console.log(`Final Cork city routes: ${finalRouteIds.size}`);

  // Re-filter trips/stopTimes/shapes to final route set
  const finalTrips = new Map();
  for (const [tid, t] of tripsById) {
    if (finalRouteIds.has(t.routeId)) finalTrips.set(tid, t);
  }
  const finalShapeIds = new Set();
  for (const t of finalTrips.values()) finalShapeIds.add(t.shapeId);

  console.log("Reading shapes.txt (streaming) ...");
  const shapePoints = new Map(); // shapeId -> array of {seq,lat,lon}
  await readCsv(path.join(SRC, "shapes.txt"), (row) => {
    if (!finalShapeIds.has(row.shape_id)) return;
    if (!shapePoints.has(row.shape_id)) shapePoints.set(row.shape_id, []);
    shapePoints.get(row.shape_id).push({
      seq: parseInt(row.shape_pt_sequence, 10),
      lat: parseFloat(row.shape_pt_lat),
      lon: parseFloat(row.shape_pt_lon),
    });
  });
  for (const pts of shapePoints.values()) pts.sort((a, b) => a.seq - b.seq);
  console.log(`Shapes captured: ${shapePoints.size}`);

  // Build final stop set used
  const usedStopIds = new Set();
  for (const [tid] of finalTrips) {
    const sts = stopTimesByTrip.get(tid);
    if (sts) for (const st of sts) usedStopIds.add(st.stopId);
  }

  // Map stop -> route ids serving it
  const stopRoutes = new Map();
  for (const t of finalTrips.values()) {
    const sts = stopTimesByTrip.get(t.tripId);
    if (!sts) continue;
    for (const st of sts) {
      if (!stopRoutes.has(st.stopId)) stopRoutes.set(st.stopId, new Set());
      stopRoutes.get(st.stopId).add(t.routeId);
    }
  }

  // ---- Build output: client dataset (routes, stops, shapes) ----
  const routesOut = candidateRoutes
    .filter((r) => finalRouteIds.has(r.route_id))
    .map((r) => ({
      id: r.route_id,
      shortName: r.route_short_name,
      longName: r.route_long_name,
    }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName, undefined, { numeric: true }));

  const stopsOut = [...usedStopIds]
    .map((sid) => stopsById.get(sid))
    .filter(Boolean)
    .map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      routeIds: [...(stopRoutes.get(s.id) ?? [])],
    }));

  // Pick the fullest (most-points) shape per (routeId, directionId) - avoids
  // bundling ~15 near-duplicate patterns per route when 1-2 lines suffice
  // to draw the route on the map.
  const bestShapePerDirection = new Map(); // key `${routeId}|${directionId}` -> {shapeId, points, headsign}
  for (const t of finalTrips.values()) {
    const pts = shapePoints.get(t.shapeId);
    if (!pts || pts.length === 0) continue;
    const key = `${t.routeId}|${t.directionId}`;
    const existing = bestShapePerDirection.get(key);
    if (!existing || pts.length > existing.points.length) {
      bestShapePerDirection.set(key, { shapeId: t.shapeId, points: pts, headsign: t.headsign, directionId: t.directionId, routeId: t.routeId });
    }
  }

  const SIMPLIFY_TOLERANCE_DEG = 0.00003; // ~3m
  const shapesOut = [];
  for (const { shapeId, points, headsign, directionId, routeId } of bestShapePerDirection.values()) {
    const latLon = points.map((p) => [p.lat, p.lon]);
    const simplified = simplify(latLon, SIMPLIFY_TOLERANCE_DEG);
    shapesOut.push({
      shapeId,
      routeId,
      directionId,
      headsign,
      points: simplified.map(([lat, lon]) => [round(lat, 6), round(lon, 6)]),
    });
  }

  // Compact per-route, per-direction ordered stop pattern - used both to
  // find "next stop after current" along a route, and (via offsetSec) to
  // turn the live feed's schedule *delay* into a real predicted clock time:
  // the NTA TripUpdates feed gives stop_time_update.arrival.delay (seconds
  // vs. schedule) rather than an absolute time, so we need each stop's
  // scheduled offset from the trip's start_time to reconstruct it.
  function toSeconds(hms) {
    const [h, m, s] = hms.split(":").map(Number);
    return h * 3600 + m * 60 + s;
  }
  const patternKey = (routeId, directionId) => `${routeId}|${directionId}`;
  const bestPatternTrip = new Map(); // key -> {tripId, stopCount}
  for (const t of finalTrips.values()) {
    const sts = stopTimesByTrip.get(t.tripId);
    if (!sts) continue;
    const key = patternKey(t.routeId, t.directionId);
    const existing = bestPatternTrip.get(key);
    if (!existing || sts.length > existing.stopCount) {
      bestPatternTrip.set(key, { tripId: t.tripId, stopCount: sts.length });
    }
  }
  const routePatterns = [];
  for (const [key, { tripId }] of bestPatternTrip) {
    const [routeId, directionId] = key.split("|");
    const sts = stopTimesByTrip.get(tripId).slice().sort((a, b) => a.seq - b.seq);
    const tripStartSec = toSeconds(sts[0].dep);
    routePatterns.push({
      routeId,
      directionId,
      stops: sts.map((s) => ({
        stopId: s.stopId,
        offsetSec: toSeconds(s.arr) - tripStartSec,
      })),
    });
  }

  const stopsRounded = stopsOut.map((s) => ({ ...s, lat: round(s.lat, 6), lon: round(s.lon, 6) }));

  const clientData = {
    generatedAt: new Date().toISOString(),
    bbox: CORK_BBOX,
    routes: routesOut,
    stops: stopsRounded,
    shapes: shapesOut,
    routePatterns,
  };

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "cork-static.json"), JSON.stringify(clientData));

  console.log("---- Summary ----");
  console.log("Routes:", routesOut.length);
  console.log("Stops:", stopsRounded.length);
  console.log("Shapes:", shapesOut.length, "(deduped from", shapeIdsByRoute.size ? [...shapeIdsByRoute.values()].reduce((a, s) => a + s.size, 0) : 0, ")");
  console.log("Route patterns:", routePatterns.length);
  const clientSize = fs.statSync(path.join(OUT, "cork-static.json")).size;
  console.log(`cork-static.json: ${(clientSize / 1024).toFixed(0)} KB`);
  console.log("Route list:", routesOut.map((r) => r.shortName).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
