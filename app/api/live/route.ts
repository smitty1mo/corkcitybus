import { NextResponse } from "next/server";
import { fetchAndFilterCorkVehicles } from "@/lib/gtfs-rt";
import type { LiveFeedResponse, LiveVehicle } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// NTA's API limit is one request per 60s; we poll no more than once per 61s
// and serve every request in between from this in-memory cache. Serverless
// instances are frequently reused under steady polling traffic, so this
// keeps us well under the limit without needing an external cache store.
const MIN_POLL_INTERVAL_MS = 61_000;

let cachedVehicles: LiveVehicle[] | null = null;
let lastSuccessAt: number | null = null; // unix seconds
let lastAttemptAt = 0; // ms, Date.now()
let lastError: string | null = null;
let inFlight: Promise<void> | null = null;

async function refreshIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastAttemptAt < MIN_POLL_INTERVAL_MS) return;
  if (inFlight) return inFlight;

  lastAttemptAt = now;
  const apiKey = process.env.NTA_API_KEY;

  inFlight = (async () => {
    try {
      if (!apiKey) {
        throw new Error("NTA_API_KEY is not configured on the server");
      }
      const vehicles = await fetchAndFilterCorkVehicles(apiKey);
      cachedVehicles = vehicles;
      lastSuccessAt = Math.floor(Date.now() / 1000);
      lastError = null;
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Unknown error fetching live feed";
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function GET() {
  await refreshIfDue();

  const body: LiveFeedResponse = {
    fetchedAt: Math.floor(Date.now() / 1000),
    lastSuccessAt: lastSuccessAt ?? 0,
    stale: lastError !== null && cachedVehicles !== null,
    error: lastError,
    vehicles: cachedVehicles ?? [],
  };

  return NextResponse.json(body, {
    headers: {
      // Client polls this itself; avoid any intermediary/browser caching
      // beyond our own server-side throttle.
      "Cache-Control": "no-store",
    },
  });
}
