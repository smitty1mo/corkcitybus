"use client";

import { useEffect, useState } from "react";
import type { CorkStaticData, LiveVehicle, Selection } from "@/lib/types";
import { formatEtaLabel, formatRelativeAgo } from "@/lib/eta";
import { getUpcomingArrivalsForStop, getNearestStopOnRoute } from "@/lib/predictions";
import { STALE_VEHICLE_AFTER_SECONDS } from "@/lib/constants";

export default function DetailSheet({
  selection,
  onClose,
  staticData,
  vehicles,
  colors,
  userLocation,
}: {
  selection: Selection;
  onClose: () => void;
  staticData: CorkStaticData;
  vehicles: LiveVehicle[];
  colors: Record<string, string>;
  userLocation: { lat: number; lon: number } | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!selection) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [selection]);

  if (!selection) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md animate-slide-up rounded-[22px] bg-white shadow-sheet">
        {selection.type === "bus" && (
          <BusDetail
            vehicleId={selection.vehicleId}
            vehicles={vehicles}
            staticData={staticData}
            colors={colors}
            now={now}
            onClose={onClose}
          />
        )}
        {selection.type === "stop" && (
          <StopDetail
            stopId={selection.stopId}
            vehicles={vehicles}
            staticData={staticData}
            colors={colors}
            now={now}
            onClose={onClose}
          />
        )}
        {selection.type === "route" && (
          <RouteDetail
            routeId={selection.routeId}
            vehicles={vehicles}
            staticData={staticData}
            colors={colors}
            userLocation={userLocation}
            now={now}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}

function SheetHeader({
  badgeColor,
  badgeLabel,
  title,
  subtitle,
  onClose,
}: {
  badgeColor: string;
  badgeLabel: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-5 pt-4">
      <span
        className="flex h-9 min-w-[2.5rem] shrink-0 items-center justify-center rounded-xl px-2 text-[14px] font-bold text-white"
        style={{ backgroundColor: badgeColor }}
      >
        {badgeLabel}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h3 className="truncate text-[16px] font-bold text-neutral-900">{title}</h3>
        {subtitle && <p className="truncate text-[13px] text-neutral-500">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 active:bg-neutral-200"
      >
        ✕
      </button>
    </div>
  );
}

function BusDetail({
  vehicleId,
  vehicles,
  staticData,
  colors,
  now,
  onClose,
}: {
  vehicleId: string;
  vehicles: LiveVehicle[];
  staticData: CorkStaticData;
  colors: Record<string, string>;
  now: number;
  onClose: () => void;
}) {
  const vehicle = vehicles.find((v) => v.vehicleId === vehicleId);

  if (!vehicle) {
    return (
      <div className="px-5 py-6 text-center">
        <p className="text-[14px] text-neutral-500">This bus is no longer active.</p>
        <button
          onClick={onClose}
          className="mt-3 rounded-full bg-neutral-100 px-4 py-2 text-[13px] font-semibold text-neutral-600"
        >
          Close
        </button>
      </div>
    );
  }

  const route = staticData.routes.find((r) => r.id === vehicle.routeId);
  const next = vehicle.nextStops[0];
  const nextStop = next ? staticData.stops.find((s) => s.id === next.stopId) : null;
  const isStale = now / 1000 - vehicle.timestamp > STALE_VEHICLE_AFTER_SECONDS;

  return (
    <div className="pb-5">
      <SheetHeader
        badgeColor={route ? colors[route.id] : "#8E8E93"}
        badgeLabel={route?.shortName ?? "?"}
        title={route?.longName ?? "Bus"}
        subtitle={
          isStale
            ? `(no connection) · last seen ${formatRelativeAgo(vehicle.timestamp, now)}`
            : `Updated ${formatRelativeAgo(vehicle.timestamp, now)}`
        }
        onClose={onClose}
      />
      <div className="mt-4 flex items-center justify-between px-5">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-neutral-400">
            Next stop
          </p>
          <p className="text-[15px] font-semibold text-neutral-900">
            {nextStop?.name ?? "Unknown"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[12px] font-medium uppercase tracking-wide text-neutral-400">
            Arriving
          </p>
          <p className="text-[15px] font-semibold text-cork-red">
            {next ? formatEtaLabel(next.arrivalUnix, now) : "Unknown"}
          </p>
        </div>
      </div>
    </div>
  );
}

function StopDetail({
  stopId,
  vehicles,
  staticData,
  colors,
  now,
  onClose,
}: {
  stopId: string;
  vehicles: LiveVehicle[];
  staticData: CorkStaticData;
  colors: Record<string, string>;
  now: number;
  onClose: () => void;
}) {
  const stop = staticData.stops.find((s) => s.id === stopId);
  const arrivals = getUpcomingArrivalsForStop(stopId, vehicles);

  return (
    <div className="pb-5">
      <SheetHeader
        badgeColor="#6B6B70"
        badgeLabel="STOP"
        title={stop?.name ?? "Bus stop"}
        subtitle={`${arrivals.length} bus${arrivals.length === 1 ? "" : "es"} approaching`}
        onClose={onClose}
      />
      <div className="momentum-scroll mt-3 max-h-64 overflow-y-auto px-5">
        {arrivals.length === 0 && (
          <p className="py-4 text-[14px] text-neutral-400">
            No live buses currently approaching this stop.
          </p>
        )}
        {arrivals.map((a) => {
          const route = staticData.routes.find((r) => r.id === a.routeId);
          return (
            <div
              key={a.vehicleId}
              className="flex items-center gap-3 border-b border-neutral-100 py-2.5 last:border-0"
            >
              <span
                className="flex h-7 min-w-[2rem] items-center justify-center rounded-lg px-1.5 text-[12px] font-bold text-white"
                style={{ backgroundColor: route ? colors[route.id] : "#8E8E93" }}
              >
                {route?.shortName ?? "?"}
              </span>
              <span className="flex-1 truncate text-[13px] text-neutral-600">
                {route?.longName}
              </span>
              <span className="text-[14px] font-semibold text-neutral-900">
                {formatEtaLabel(a.arrivalUnix, now)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RouteDetail({
  routeId,
  vehicles,
  staticData,
  colors,
  userLocation,
  now,
  onClose,
}: {
  routeId: string;
  vehicles: LiveVehicle[];
  staticData: CorkStaticData;
  colors: Record<string, string>;
  userLocation: { lat: number; lon: number } | null;
  now: number;
  onClose: () => void;
}) {
  const route = staticData.routes.find((r) => r.id === routeId);
  const nearest = userLocation
    ? getNearestStopOnRoute(routeId, userLocation.lat, userLocation.lon, staticData.stops)
    : null;
  const arrival = nearest
    ? getUpcomingArrivalsForStop(nearest.stop.id, vehicles).find((a) => a.routeId === routeId)
    : undefined;

  return (
    <div className="pb-5">
      <SheetHeader
        badgeColor={colors[routeId] ?? "#8E8E93"}
        badgeLabel={route?.shortName ?? "?"}
        title={route?.longName ?? "Route"}
        onClose={onClose}
      />
      <div className="mt-4 px-5">
        {!userLocation && (
          <p className="text-[13px] text-neutral-500">
            Enable location to see the nearest stop on this route.
          </p>
        )}
        {userLocation && !nearest && (
          <p className="text-[13px] text-neutral-500">No stops found for this route.</p>
        )}
        {nearest && (
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-medium uppercase tracking-wide text-neutral-400">
                Nearest stop to you
              </p>
              <p className="truncate text-[15px] font-semibold text-neutral-900">
                {nearest.stop.name}
              </p>
              <p className="text-[12px] text-neutral-400">
                {Math.round(nearest.distanceMeters)} m away
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[12px] font-medium uppercase tracking-wide text-neutral-400">
                Next bus
              </p>
              <p className="text-[15px] font-semibold text-cork-red">
                {formatEtaLabel(arrival?.arrivalUnix ?? null, now)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
