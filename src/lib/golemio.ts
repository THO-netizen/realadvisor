// Golemio API klient — pražská dopravní data (zastávky MHD, isochrony)
// Docs: https://api.golemio.cz/v2/docs/
// Vyžaduje GOLEMIO_API_KEY v .env.local

export interface TransitStop {
  name: string;
  stopType: "metro" | "tram" | "bus" | "train";
  distanceMeters: number;
  walkMinutes: number;
  lat: number;
  lng: number;
}

export interface TransitData {
  nearestMetroMinutes: number | null;
  nearestMhdMinutes: number | null;
  stops: TransitStop[];
  source: "golemio" | "mock";
}

const GOLEMIO_BASE = "https://api.golemio.cz/v2";
const WALK_SPEED_MPS = 1.25; // 4,5 km/h

function metersToMinutes(m: number): number {
  return Math.round(m / WALK_SPEED_MPS / 60);
}

/** Vypočítá přibližnou polohu bodu vzdáleného `distMeters` pod úhlem `bearingDeg` od středu. */
function bearingOffset(
  centerLat: number,
  centerLng: number,
  distMeters: number,
  bearingDeg: number
): { lat: number; lng: number } {
  const R = 6_371_000;
  const d = distMeters / R;
  const b = (bearingDeg * Math.PI) / 180;
  const lat1 = (centerLat * Math.PI) / 180;
  const lng1 = (centerLng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

// Cache v paměti (GPS → data), TTL 1 hodina
const cache = new Map<string, { data: TransitData; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1_000;

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

async function fetchGolemio(lat: number, lng: number): Promise<TransitData> {
  const apiKey = process.env.GOLEMIO_API_KEY;
  if (!apiKey) return getMockTransitData(lat, lng);

  const url = `${GOLEMIO_BASE}/gtfs/stops?latlng=${lat},${lng}&range=800&limit=20&offset=0`;

  const res = await fetch(url, {
    headers: { "x-access-token": apiKey, Accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return getMockTransitData(lat, lng);

  interface GolemioFeature {
    geometry?: { coordinates?: [number, number] };
    properties: {
      stop_name: string;
      route_type?: number;
      distance?: number;
    };
  }

  interface GolemioResponse {
    features?: GolemioFeature[];
  }

  const json = (await res.json()) as GolemioResponse;
  const features = json.features ?? [];

  const stops: TransitStop[] = features.map((f) => {
    const dist = f.properties.distance ?? 500;
    const routeType = f.properties.route_type ?? 3;
    let stopType: TransitStop["stopType"] = "bus";
    if (routeType === 1) stopType = "metro";
    else if (routeType === 0) stopType = "tram";
    else if (routeType === 2) stopType = "train";

    // GeoJSON: [lng, lat]
    const coords = f.geometry?.coordinates;
    const stopLat = coords ? coords[1] : lat;
    const stopLng = coords ? coords[0] : lng;

    return {
      name: f.properties.stop_name,
      stopType,
      distanceMeters: dist,
      walkMinutes: metersToMinutes(dist),
      lat: stopLat,
      lng: stopLng,
    };
  });

  const metro = stops.filter((s) => s.stopType === "metro");

  return {
    nearestMetroMinutes:
      metro.length > 0 ? Math.min(...metro.map((s) => s.walkMinutes)) : null,
    nearestMhdMinutes:
      stops.length > 0 ? Math.min(...stops.map((s) => s.walkMinutes)) : null,
    stops: stops.slice(0, 10),
    source: "golemio",
  };
}

/** Mock data — konzistentní zastávky rozložené kolem středu. */
function getMockTransitData(lat: number, lng: number): TransitData {
  const seed = Math.abs(Math.round((lat + lng) * 1000)) % 20;

  const mockDefs: Array<{
    name: string;
    type: TransitStop["stopType"];
    dist: number;
    bearing: number;
  }> = [
    { name: "Metro A (demo)", type: "metro", dist: (5 + seed) * WALK_SPEED_MPS * 60, bearing: 45 + seed * 3 },
    { name: "Tramvaj (demo)", type: "tram", dist: (2 + (seed % 6)) * WALK_SPEED_MPS * 60, bearing: 160 + seed * 5 },
    { name: "Autobus (demo)", type: "bus", dist: (3 + (seed % 4)) * WALK_SPEED_MPS * 60, bearing: 270 + seed * 4 },
    { name: "Tramvaj 2 (demo)", type: "tram", dist: (4 + (seed % 7)) * WALK_SPEED_MPS * 60, bearing: 330 + seed * 2 },
  ];

  const stops: TransitStop[] = mockDefs.map((d) => {
    const pos = bearingOffset(lat, lng, d.dist, d.bearing);
    return {
      name: d.name,
      stopType: d.type,
      distanceMeters: d.dist,
      walkMinutes: metersToMinutes(d.dist),
      lat: pos.lat,
      lng: pos.lng,
    };
  });

  return {
    nearestMetroMinutes: stops.find((s) => s.stopType === "metro")?.walkMinutes ?? null,
    nearestMhdMinutes: Math.min(...stops.map((s) => s.walkMinutes)),
    stops,
    source: "mock",
  };
}

export async function getTransitData(lat: number, lng: number): Promise<TransitData> {
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await fetchGolemio(lat, lng);
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}
