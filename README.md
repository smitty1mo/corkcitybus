# Cork City Bus Live

A live-updating map of Bus Éireann's Cork city bus network — real-time bus
positions, routes, stops, and arrival predictions, built with Next.js and
MapLibre GL.

## How it works

- **Static data** (`public/data/cork-static.json`): Cork city routes, stops,
  and route shapes, extracted once from the full national Bus Éireann GTFS
  feed and bundled into the app (see [Regenerating the static
  data](#regenerating-the-static-data)). This is committed to the repo and
  never re-fetched at runtime.
- **Live data** (`app/api/live/route.ts`): a serverless API route that
  fetches the NTA's GTFS-Realtime `VehiclePositions` and `TripUpdates` feeds,
  decodes the protobuf, filters to Cork city routes, and caches the result
  in memory. It polls the upstream NTA API at most once every 61 seconds
  (their limit is 60s) — the client can poll `/api/live` itself more often,
  but always gets the cached result. The NTA API key stays server-side and
  is never sent to the browser.
- **The map** (`components/MapView.tsx`): MapLibre GL with a free CARTO
  Positron (light) raster basemap, locked to a Cork city bounding box. Route
  lines are hidden when no bus is currently active on them, and bus icons
  are interpolated smoothly between GPS fixes on the client.

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in NTA_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Getting an NTA API key

1. Register at [developer.nationaltransport.ie](https://developer.nationaltransport.ie/)
2. Subscribe to the **GTFS-Realtime** product
3. Copy your subscription key into `NTA_API_KEY` in `.env.local`

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com/new).
3. Add an environment variable `NTA_API_KEY` with your NTA subscription key
   (Project Settings → Environment Variables).
4. Deploy. No other configuration is needed — `app/api/live/route.ts` runs
   as a Vercel serverless function automatically.

## Regenerating the static data

The bundled dataset (`public/data/cork-static.json`) only needs to be
rebuilt if NTA reissues the static GTFS feed with route/stop changes:

```bash
curl -o /tmp/gtfs.zip https://www.transportforireland.ie/transitData/Data/GTFS_Bus_Eireann.zip
unzip /tmp/gtfs.zip -d /tmp/gtfs
node scripts/build-gtfs-data.mjs /tmp/gtfs public/data
```

This streams the (large) national `stop_times.txt`/`shapes.txt` files,
filters to Cork city routes (numbered 201-226, validated against a Cork
bounding box), simplifies route geometry, and writes a compact JSON bundle.

## Project structure

```
app/
  page.tsx              landing page
  map/page.tsx           live map page (client-only, dynamically imported)
  api/live/route.ts      serverless GTFS-Realtime polling endpoint
components/
  MapView.tsx             MapLibre map, layers, animation loop
  RouteFilterSheet.tsx     route checkbox filter
  DetailSheet.tsx          bus/stop/route detail bottom sheet
  StatusBanner.tsx         "last known positions" banner
lib/
  gtfs-rt.ts               fetch + decode + filter GTFS-Realtime feeds
  gtfs-static-server.ts    server-side loader for the bundled static data
  useStaticData.ts         client-side loader
  useLiveVehicles.ts       client-side polling + animation state
  useGeolocation.ts        user location
  predictions.ts           arrival/ETA helpers
  colors.ts                per-route color palette
  geo.ts                   distance/bearing/interpolation math
scripts/
  build-gtfs-data.mjs      one-off static GTFS processing script
```

## Attribution

Basemap © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors, © [CARTO](https://carto.com/attributions). Live and static
transit data © National Transport Authority / Bus Éireann, via the
[NTA GTFS-Realtime API](https://developer.nationaltransport.ie/). This
project is not affiliated with Bus Éireann or the NTA.
