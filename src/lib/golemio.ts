// Golemio API klient — pražská dopravní data (zastávky MHD, isochrony)
// Docs: https://api.golemio.cz/v2/docs/
// Vyžaduje GOLEMIO_API_KEY v .env.local

export interface TransitStop {
  name: string;
  stopType: "metro" | "tram" | "bus" | "train";
  distanceMeters: number;
  walkMinutes: number;
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

// Cache v paměti (GPS → data), TTL 1 hodina
const cache = new Map<string, { data: TransitData; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1_000;

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

async function fetchGolemio(lat: number, lng: number): Promise<TransitData> {
  const apiKey = process.env.GOLEMIO_API_KEY;
  if (!apiKey) return getMockTransitData(lat, lng);

  const url =
    `${GOLEMIO_BASE}/gtfs/stops?latlng=${lat},${lng}&range=1000&limit=20&offset=0`;

  const res = await fetch(url, {
    headers: { "x-access-token": apiKey, Accept: "application/json" },
    next: { revalidate: 3600 },
  });

  if (!res.ok) return getMockTransitData(lat, lng);

  interface GolemioFeature {
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

    return {
      name: f.properties.stop_name,
      stopType,
      distanceMeters: dist,
      walkMinutes: metersToMinutes(dist),
    };
  });

  const metro = stops.filter((s) => s.stopType === "metro");
  const anyMhd = stops;

  return {
    nearestMetroMinutes:
      metro.length > 0
        ? Math.min(...metro.map((s) => s.walkMinutes))
        : null,
    nearestMhdMinutes:
      anyMhd.length > 0
        ? Math.min(...anyMhd.map((s) => s.walkMinutes))
        : null,
    stops: stops.slice(0, 10),
    source: "golemio",
  };
}

/** Mock data pro vývoj bez API klíče — vrací konzistentní hodnoty pro danou polohu. */
function getMockTransitData(lat: number, lng: number): TransitData {
  // Jednoduché pseudo-náhodné hodnoty odvozené z GPS
  const seed = Math.abs(Math.round((lat + lng) * 1000)) % 20;
  return {
    nearestMetroMinutes: 5 + seed,
    nearestMhdMinutes: 2 + (seed % 8),
    stops: [
      {
        name: "Nejbližší zastávka (demo)",
        stopType: "tram",
        distanceMeters: (2 + (seed % 8)) * WALK_SPEED_MPS * 60,
        walkMinutes: 2 + (seed % 8),
      },
    ],
    source: "mock",
  };
}

export async function getTransitData(
  lat: number,
  lng: number
): Promise<TransitData> {
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const data = await fetchGolemio(lat, lng);
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}
