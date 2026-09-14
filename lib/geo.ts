export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Bus Éireann's Capwell depot (Summerhill South, Cork) - the main storage,
 * maintenance and cleaning yard for the Cork city fleet. Buses sitting here
 * aren't in service, so we hide them from the live map.
 */
export const CORK_DEPOT = { lat: 51.8814, lon: -8.469, radiusMeters: 220 };

export function isNearDepot(lat: number, lon: number): boolean {
  return haversineMeters(lat, lon, CORK_DEPOT.lat, CORK_DEPOT.lon) <= CORK_DEPOT.radiusMeters;
}

/** Interpolates between two [lat, lon] points, t in [0, 1]. */
export function interpolateLatLon(
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * clamped, a[1] + (b[1] - a[1]) * clamped];
}

/** Shortest-path interpolation between two bearings (degrees, 0-360). */
export function interpolateBearing(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * clamped + 360) % 360;
}

/**
 * Dead-reckoning: projects a point forward along a bearing at a given speed
 * for a duration, using a flat-earth approximation (accurate to a few
 * centimetres over the few-hundred-metre distances this is used for). Lets
 * a bus keep drifting forward at its last known heading/speed once it's
 * caught up to the latest real GPS fix, rather than freezing in place while
 * waiting for the next one.
 */
export function projectForward(
  lat: number,
  lon: number,
  bearingDeg: number,
  speedMps: number,
  seconds: number
): [number, number] {
  const distanceMeters = speedMps * seconds;
  const R = 6371000;
  const bearingRad = (bearingDeg * Math.PI) / 180;
  const dLat = ((distanceMeters * Math.cos(bearingRad)) / R) * (180 / Math.PI);
  const dLon =
    ((distanceMeters * Math.sin(bearingRad)) / (R * Math.cos((lat * Math.PI) / 180))) *
    (180 / Math.PI);
  return [lat + dLat, lon + dLon];
}

/**
 * Projects point p onto the segment a->b using a local planar (equirectangular)
 * approximation around `a` - accurate enough for the few-hundred-metre spacing
 * between consecutive bus stops. Returns the *unclamped* fraction along the
 * segment (negative before a, >1 past b) so callers can tell whether p falls
 * before the segment even starts, plus the distance in metres to the nearest
 * point actually on the segment.
 */
export function projectOntoSegment(
  lat: number,
  lon: number,
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): { t: number; distanceMeters: number } {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((aLat * Math.PI) / 180);

  const bx = (bLon - aLon) * mPerDegLon;
  const by = (bLat - aLat) * mPerDegLat;
  const px = (lon - aLon) * mPerDegLon;
  const py = (lat - aLat) * mPerDegLat;

  const abLenSq = bx * bx + by * by;
  const t = abLenSq > 0 ? (px * bx + py * by) / abLenSq : 0;
  const tClamped = Math.max(0, Math.min(1, t));

  const projX = bx * tClamped;
  const projY = by * tClamped;
  const dx = px - projX;
  const dy = py - projY;

  return { t, distanceMeters: Math.sqrt(dx * dx + dy * dy) };
}

export function bearingBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
