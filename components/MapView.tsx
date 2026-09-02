"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, LineString, Point } from "geojson";
import Link from "next/link";

import { useStaticData } from "@/lib/useStaticData";
import { useLiveVehicles } from "@/lib/useLiveVehicles";
import { useGeolocation } from "@/lib/useGeolocation";
import { assignRouteColors } from "@/lib/colors";
import { CORK_MAP_BBOX, STALE_VEHICLE_AFTER_SECONDS } from "@/lib/constants";
import { interpolateLatLon, interpolateBearing, bearingBetween } from "@/lib/geo";
import type { Selection } from "@/lib/types";
import RouteFilterSheet from "./RouteFilterSheet";
import DetailSheet from "./DetailSheet";
import StatusBanner from "./StatusBanner";

const INTERACTIVE_LAYERS = ["buses-icon", "stops-circle", "route-lines"] as const;
const BUS_RENDER_INTERVAL_MS = 100; // 10fps client-side interpolation redraw

export default function MapView() {
  const { data } = useStaticData();
  const { animRef, meta, version } = useLiveVehicles();
  const geo = useGeolocation();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const sourcesReadyRef = useRef(false);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedRouteIds, setSelectedRouteIds] = useState<Set<string>>(new Set());
  const [activeRouteIds, setActiveRouteIds] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection>(null);

  const colors = useMemo(() => (data ? assignRouteColors(data.routes) : {}), [data]);

  // Default: every route selected once static data is in.
  useEffect(() => {
    if (data) setSelectedRouteIds(new Set(data.routes.map((r) => r.id)));
  }, [data]);

  const fullRoutesGeoJSON = useMemo<FeatureCollection<LineString> | null>(() => {
    if (!data) return null;
    return {
      type: "FeatureCollection",
      features: data.shapes.map((s) => ({
        type: "Feature",
        properties: { routeId: s.routeId, color: colors[s.routeId] ?? "#8E8E93" },
        geometry: {
          type: "LineString",
          coordinates: s.points.map(([lat, lon]) => [lon, lat]),
        },
      })),
    };
  }, [data, colors]);

  const fullStopsGeoJSON = useMemo<FeatureCollection<Point> | null>(() => {
    if (!data) return null;
    return {
      type: "FeatureCollection",
      features: data.stops.map((s) => ({
        type: "Feature",
        properties: { stopId: s.id, name: s.name, routeIds: s.routeIds },
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      })),
    };
  }, [data]);

  // ---- Map init (once) ----
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const centerLon = (CORK_MAP_BBOX.minLon + CORK_MAP_BBOX.maxLon) / 2;
    const centerLat = (CORK_MAP_BBOX.minLat + CORK_MAP_BBOX.maxLat) / 2;
    const pad = 0.01;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      // OpenFreeMap's hosted "positron" style: genuinely free vector tiles,
      // no API key, no rate limit (unlike CARTO's raster tiles, which
      // started requiring a key on their free tier). Ships its own
      // glyphs/sprite, so no separate glyphs URL is needed.
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [centerLon, centerLat],
      zoom: 12.3,
      minZoom: 11,
      maxZoom: 18,
      maxBounds: [
        [CORK_MAP_BBOX.minLon - pad, CORK_MAP_BBOX.minLat - pad],
        [CORK_MAP_BBOX.maxLon + pad, CORK_MAP_BBOX.maxLat + pad],
      ],
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

    // "load" waits for the basemap's own tiles to render, not just the
    // style to parse - if the tile CDN is briefly unreachable that would
    // otherwise block our bus/stop/route data from appearing too. Use
    // "load" in the normal case, but fall back to a short timer so our
    // data layers still show up on top of a blank background if the
    // basemap is being slow.
    let alreadyMarked = false;
    const markLoaded = () => {
      if (alreadyMarked) return;
      alreadyMarked = true;
      setMapLoaded(true);
    };
    map.on("load", markLoaded);
    const fallbackTimer = setTimeout(markLoaded, 4000);

    // Defensive: make sure the canvas picks up the container's real size
    // even if the browser's own resize-observer timing is off (seen in some
    // embedded/automated contexts).
    const resizeNow = () => map.resize();
    requestAnimationFrame(resizeNow);
    window.addEventListener("resize", resizeNow);

    mapRef.current = map;

    return () => {
      clearTimeout(fallbackTimer);
      window.removeEventListener("resize", resizeNow);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- Add sources/layers once map + static data are ready ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !fullRoutesGeoJSON || !fullStopsGeoJSON || sourcesReadyRef.current) {
      return;
    }

    // mapLoaded can go true from the fallback timer before a *remote* style
    // (like OpenFreeMap's style.json) has actually finished loading -
    // addSource/addLayer throw if called too early. Poll isStyleLoaded()
    // directly rather than an "idle" listener, which React's effect
    // double-invoke (dev StrictMode: mount -> cleanup -> mount) can tear
    // down before it ever fires.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function trySetup() {
      if (cancelled || sourcesReadyRef.current) return;
      if (!map!.isStyleLoaded()) {
        timer = setTimeout(trySetup, 150);
        return;
      }
      sourcesReadyRef.current = true;
      addSourcesAndLayers(map!);
    }

    trySetup();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mapLoaded, fullRoutesGeoJSON, fullStopsGeoJSON]);

  function addSourcesAndLayers(map: MapLibreMap) {
    map.addSource("routes", { type: "geojson", data: emptyFC() });
    map.addSource("stops", { type: "geojson", data: emptyFC() });
    map.addSource("buses", { type: "geojson", data: emptyFC() });

    map.addLayer({
      id: "route-lines",
      type: "line",
      source: "routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 15, 4.5, 18, 6],
        "line-opacity": 0.82,
      },
    });

    map.addLayer({
      id: "stops-circle",
      type: "circle",
      source: "stops",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 2.5, 15, 4.5, 18, 7],
        "circle-color": "#ffffff",
        "circle-stroke-color": "#9A9AA0",
        "circle-stroke-width": 1.5,
      },
    });

    if (!map.hasImage("bus-icon")) {
      map.addImage("bus-icon", createBusIconBitmap(), { sdf: true, pixelRatio: 2 });
    }

    map.addLayer({
      id: "buses-icon",
      type: "symbol",
      source: "buses",
      layout: {
        "icon-image": "bus-icon",
        "icon-size": 0.5,
        "icon-rotate": ["get", "bearing"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": ["get", "color"],
        "icon-opacity": ["get", "opacity"],
        "icon-halo-color": "#ffffff",
        "icon-halo-width": 1.2,
      },
    });

    map.addLayer({
      id: "buses-label",
      type: "symbol",
      source: "buses",
      layout: {
        "text-field": ["get", "shortName"],
        "text-size": 10,
        "text-font": ["Noto Sans Bold"],
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-rotation-alignment": "viewport",
        "text-anchor": "center",
      },
      paint: {
        "text-color": "#ffffff",
        "text-opacity": ["get", "opacity"],
        "text-halo-color": "rgba(0,0,0,0.25)",
        "text-halo-width": 0.3,
      },
    });

    map.on("click", (e) => {
      for (const layerId of INTERACTIVE_LAYERS) {
        const features = map.queryRenderedFeatures(e.point, { layers: [layerId] });
        if (features.length === 0) continue;
        const props = features[0].properties as Record<string, unknown>;
        if (layerId === "buses-icon") {
          setSelection({ type: "bus", vehicleId: String(props.vehicleId) });
        } else if (layerId === "stops-circle") {
          setSelection({ type: "stop", stopId: String(props.stopId) });
        } else {
          setSelection({ type: "route", routeId: String(props.routeId) });
        }
        return;
      }
      setSelection(null);
    });

    map.on("mousemove", (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [...INTERACTIVE_LAYERS] });
      map.getCanvas().style.cursor = features.length > 0 ? "pointer" : "";
    });
  }

  // ---- Update route/stop sources when filter selection changes ----
  const visibleRouteLineIds = useMemo(() => {
    const s = new Set<string>();
    for (const id of selectedRouteIds) if (activeRouteIds.has(id)) s.add(id);
    return s;
  }, [selectedRouteIds, activeRouteIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourcesReadyRef.current || !fullRoutesGeoJSON) return;
    const src = map.getSource("routes") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: fullRoutesGeoJSON.features.filter((f) =>
        visibleRouteLineIds.has(f.properties!.routeId as string)
      ),
    });
  }, [fullRoutesGeoJSON, visibleRouteLineIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sourcesReadyRef.current || !fullStopsGeoJSON) return;
    const src = map.getSource("stops") as GeoJSONSource | undefined;
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: fullStopsGeoJSON.features.filter((f) => {
        const routeIds = f.properties!.routeIds as string[];
        return routeIds.some((id) => selectedRouteIds.has(id));
      }),
    });
  }, [fullStopsGeoJSON, selectedRouteIds]);

  // ---- Bus animation loop: interpolate positions client-side, redraw at ~10fps ----
  useEffect(() => {
    if (!mapLoaded || !sourcesReadyRef.current) return;

    const interval = setInterval(() => {
      const map = mapRef.current;
      if (!map) return;
      const src = map.getSource("buses") as GeoJSONSource | undefined;
      if (!src) return;

      const nowSec = Date.now() / 1000;
      const features: FeatureCollection<Point>["features"] = [];
      const active = new Set<string>();

      for (const anim of animRef.current.values()) {
        const { vehicle, prev, curr } = anim;
        if (!vehicle.routeId) continue;
        active.add(vehicle.routeId);
        if (!selectedRouteIds.has(vehicle.routeId)) continue;

        const span = curr.timestamp - prev.timestamp;
        const t = span > 0 ? Math.max(0, Math.min(1, (nowSec - prev.timestamp) / span)) : 1;
        const [lat, lon] = interpolateLatLon([prev.lat, prev.lon], [curr.lat, curr.lon], t);

        let bearing = curr.bearing ?? prev.bearing ?? 0;
        if (prev.bearing != null && curr.bearing != null) {
          bearing = interpolateBearing(prev.bearing, curr.bearing, t);
        } else if (Math.abs(curr.lat - prev.lat) > 1e-7 || Math.abs(curr.lon - prev.lon) > 1e-7) {
          bearing = bearingBetween(prev.lat, prev.lon, curr.lat, curr.lon);
        }

        const isStale = nowSec - vehicle.timestamp > STALE_VEHICLE_AFTER_SECONDS;

        features.push({
          type: "Feature",
          properties: {
            vehicleId: vehicle.vehicleId,
            routeId: vehicle.routeId,
            color: colors[vehicle.routeId] ?? "#8E8E93",
            shortName:
              data?.routes.find((r) => r.id === vehicle.routeId)?.shortName ?? "",
            bearing,
            opacity: isStale ? 0.4 : 1,
          },
          geometry: { type: "Point", coordinates: [lon, lat] },
        });
      }

      src.setData({ type: "FeatureCollection", features });

      setActiveRouteIds((prevSet) => {
        if (prevSet.size === active.size && [...active].every((id) => prevSet.has(id))) {
          return prevSet;
        }
        return active;
      });
    }, BUS_RENDER_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [mapLoaded, animRef, selectedRouteIds, colors, data, version]);

  // ---- User location marker ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo.position) return;

    if (!userMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "user-location-marker";
      el.innerHTML = `<div class="user-location-pulse"></div><div class="user-location-dot"></div>`;
      userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([
        geo.position.lon,
        geo.position.lat,
      ]);
      userMarkerRef.current.addTo(map);
    } else {
      userMarkerRef.current.setLngLat([geo.position.lon, geo.position.lat]);
    }
  }, [geo.position]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-neutral-100">
      {/* Inline position/inset (not just Tailwind classes) so this always
          fills its parent regardless of maplibre-gl.css's own
          `.maplibregl-map { position: relative }` rule, which loads after
          our utilities and would otherwise win the cascade tie. */}
      <div
        ref={mapContainerRef}
        className="absolute inset-0"
        style={{ position: "absolute", inset: 0 }}
      />

      <style jsx global>{`
        .user-location-marker {
          position: relative;
          width: 18px;
          height: 18px;
        }
        .user-location-dot {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #007aff;
          border: 2.5px solid white;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
        }
        .user-location-pulse {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 34px;
          height: 34px;
          border-radius: 9999px;
          background: rgba(0, 122, 255, 0.25);
          animation: user-pulse 2.2s ease-out infinite;
        }
        @keyframes user-pulse {
          0% {
            transform: scale(0.4);
            opacity: 0.9;
          }
          100% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 pt-3">
        <Link
          href="/"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-neutral-700 shadow-card backdrop-blur active:scale-95 transition-transform"
          aria-label="Back home"
        >
          <BackGlyph className="h-5 w-5" />
        </Link>

        {data && (
          <RouteFilterSheet
            routes={data.routes}
            colors={colors}
            selected={selectedRouteIds}
            activeRouteIds={activeRouteIds}
            onChange={setSelectedRouteIds}
          />
        )}
      </div>

      {meta.loaded && meta.stale && <StatusBanner lastSuccessAt={meta.lastSuccessAt} />}

      {geo.status === "denied" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-4">
          <div className="pointer-events-auto rounded-2xl bg-white/95 px-4 py-2.5 text-center text-[12.5px] text-neutral-500 shadow-soft backdrop-blur">
            Location access is off — enable it in your browser settings to see
            nearby stops and your position on the map.
          </div>
        </div>
      )}

      {data && (
        <DetailSheet
          selection={selection}
          onClose={() => setSelection(null)}
          staticData={data}
          vehicles={[...animRef.current.values()].map((a) => a.vehicle)}
          colors={colors}
          userLocation={geo.position}
        />
      )}
    </div>
  );
}

function emptyFC(): FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/** Draws a simple rounded bus body with a directional nose, as a single-channel
 * (SDF-style) bitmap so MapLibre can recolor it per-route via icon-color. */
function createBusIconBitmap(): ImageData {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";

  const w = 32;
  const h = 38;
  const x = (size - w) / 2;
  const y = (size - h) / 2 + 5;
  const r = 11;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(size / 2, y - 13);
  ctx.lineTo(x + w * 0.18, y + 6);
  ctx.lineTo(x + w * 0.82, y + 6);
  ctx.closePath();
  ctx.fill();

  return ctx.getImageData(0, 0, size, size);
}

function BackGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M12.5 4.5L6.5 10L12.5 15.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
