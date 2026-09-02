import type { StaticRoute } from "./types";

/**
 * Hand-picked categorical palette: kept away from Cork red (reserved for
 * brand/UI accents) and away from dull yellow-greens, so 26 routes drawn
 * together still read as distinct, clean lines on a light basemap.
 */
const PALETTE = [
  "#2563EB", // blue
  "#0D9488", // teal
  "#7C3AED", // violet
  "#EA580C", // orange
  "#0891B2", // cyan
  "#BE185D", // pink
  "#65A30D", // green
  "#9333EA", // purple
  "#0369A1", // sky
  "#C2410C", // burnt orange
  "#4F46E5", // indigo
  "#059669", // emerald
  "#DB2777", // rose
  "#B45309", // amber-brown
  "#0E7490", // dark cyan
  "#7E22CE", // deep purple
  "#15803D", // forest green
  "#B91C1C", // brick (muted, distinct from brand red)
  "#1D4ED8", // deep blue
  "#A16207", // gold-brown
  "#5B21B6", // indigo-violet
  "#0F766E", // deep teal
  "#C026D3", // magenta
  "#3F6212", // olive green (kept dark enough to avoid looking muddy)
  "#1E40AF", // navy
  "#9D174D", // deep rose
  "#166534", // pine green
  "#6D28D9", // grape
];

export function assignRouteColors(allRoutes: StaticRoute[]): Record<string, string> {
  const sorted = [...allRoutes].sort((a, b) =>
    a.shortName.localeCompare(b.shortName, undefined, { numeric: true })
  );
  const map: Record<string, string> = {};
  sorted.forEach((r, i) => {
    map[r.id] = PALETTE[i % PALETTE.length];
  });
  return map;
}
