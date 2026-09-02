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
