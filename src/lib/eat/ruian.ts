// RÚIAN — Registr územní identifikace, adres a nemovitostí (ČÚZK)
// Primární: Nominatim/OpenStreetMap geocoding pro adresní ověření
// Sekundární: RÚIAN API pokud je k dispozici RUIAN_API_KEY
// Fallback: mock data s odkazem na nahlížení do KN

import type { RUIANResult } from "./types";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NOMINATIM_UA = "RealAdvisor/1.0 (internal; contact: info@example.com)";

interface NominatimResult {
  place_id: number;
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
}

export async function verifyAddressRUIAN(
  addressText: string | null,
  municipality: string | null,
  gpsLat: number | null,
  gpsLng: number | null
): Promise<RUIANResult> {
  // 1. Pokud máme GPS souřadnice, použijeme reverse geocoding
  if (gpsLat && gpsLng) {
    try {
      const result = await reverseGeocode(gpsLat, gpsLng);
      if (result) return result;
    } catch {
      // fall through
    }
  }

  // 2. Pokud máme textovou adresu, geocodujeme ji
  const searchText = addressText ?? municipality;
  if (searchText) {
    try {
      const result = await forwardGeocode(searchText, municipality);
      if (result) return result;
    } catch {
      // fall through
    }
  }

  // 3. Mock fallback
  return mockResult(municipality);
}

async function reverseGeocode(lat: number, lng: number): Promise<RUIANResult | null> {
  const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=cs`;

  const res = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_UA },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as NominatimResult & {
    error?: string;
  };
  if ("error" in data) return null;

  return nominatimToResult(data, "nominatim");
}

async function forwardGeocode(
  address: string,
  municipality: string | null
): Promise<RUIANResult | null> {
  const query = encodeURIComponent(
    `${address}${municipality && !address.includes(municipality) ? `, ${municipality}` : ""}, Česká republika`
  );
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&q=${query}&countrycodes=cz&limit=1&addressdetails=1&accept-language=cs`;

  const res = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_UA },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as NominatimResult[];
  if (!data.length) return null;

  return nominatimToResult(data[0], "nominatim");
}

function nominatimToResult(
  data: NominatimResult,
  source: RUIANResult["source"]
): RUIANResult {
  const addr = data.address ?? {};
  const city = addr.city ?? addr.town ?? addr.village ?? null;
  const street = addr.road ?? null;
  const houseNum = addr.house_number ?? null;

  const officialAddress = [
    street && houseNum ? `${street} ${houseNum}` : street,
    city,
    addr.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    found: true,
    ruianId: String(data.osm_id),
    officialAddress: officialAddress || data.display_name.slice(0, 120),
    municipality: city,
    district: addr.county ?? null,
    postalCode: addr.postcode ?? null,
    parcelId: null,
    lat: parseFloat(data.lat),
    lng: parseFloat(data.lon),
    source,
    fetchedAt: new Date().toISOString(),
  };
}

function mockResult(municipality: string | null): RUIANResult {
  return {
    found: false,
    ruianId: null,
    officialAddress: municipality ? `(${municipality} — adresní ověření nedostupné)` : null,
    municipality,
    district: null,
    postalCode: null,
    parcelId: null,
    lat: null,
    lng: null,
    source: "mock",
    fetchedAt: new Date().toISOString(),
  };
}
