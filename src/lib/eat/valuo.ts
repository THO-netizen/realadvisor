// Valuo API klient — tržní ocenění nemovitostí
// Real API: VALUO_API_KEY v .env.local, endpoint dle dokumentace Valuo
// Mock: odhad na základě mediánu lokality ± variace

import type { ValuoEstimate } from "./types";

const VALUO_BASE = process.env.VALUO_API_BASE ?? "https://api.valuo.cz/v1";

interface ValuoInput {
  price: number;
  usableArea: number | null;
  municipality: string | null;
  disposition: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  condition: string | null;
  localityMedianPricePerM2: number | null;
}

async function fetchValuoReal(input: ValuoInput): Promise<ValuoEstimate> {
  const apiKey = process.env.VALUO_API_KEY!;
  const payload = {
    location: {
      lat: input.gpsLat,
      lng: input.gpsLng,
      municipality: input.municipality,
    },
    property: {
      area: input.usableArea,
      disposition: input.disposition,
      condition: input.condition,
    },
  };

  const res = await fetch(`${VALUO_BASE}/estimate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Valuo API error: ${res.status}`);

  interface ValuoApiResponse {
    estimate: number;
    low: number;
    high: number;
    confidence: "high" | "medium" | "low";
  }

  const data = (await res.json()) as ValuoApiResponse;
  const dev = input.price > 0
    ? Math.round(((data.estimate - input.price) / input.price) * 10000) / 100
    : null;

  return {
    estimatedValue: data.estimate,
    confidence: data.confidence,
    deviationPct: dev,
    rangeLow: data.low,
    rangeHigh: data.high,
    source: "valuo",
    fetchedAt: new Date().toISOString(),
  };
}

function computeMockEstimate(input: ValuoInput): ValuoEstimate {
  // Odhad = medián * plocha (pokud máme data), jinak ±7 % z nabídkové ceny
  let estimate: number;
  let confidence: ValuoEstimate["confidence"] = "low";

  if (input.localityMedianPricePerM2 && input.usableArea) {
    estimate = Math.round(input.localityMedianPricePerM2 * input.usableArea);
    confidence = "medium";
  } else if (input.price > 0) {
    // Pseudo-náhodná odchylka odvozená z ceny (deterministická — stejný vstup → stejný výstup)
    const seed = (input.price % 1000) / 1000;
    const offsetPct = -0.12 + seed * 0.15; // -12 % až +3 %
    estimate = Math.round(input.price * (1 + offsetPct));
    confidence = "low";
  } else {
    return {
      estimatedValue: null,
      confidence: "low",
      deviationPct: null,
      rangeLow: null,
      rangeHigh: null,
      source: "mock",
      fetchedAt: new Date().toISOString(),
    };
  }

  const deviationPct =
    input.price > 0
      ? Math.round(((estimate - input.price) / input.price) * 10000) / 100
      : null;

  return {
    estimatedValue: estimate,
    confidence,
    deviationPct,
    rangeLow: Math.round(estimate * 0.93),
    rangeHigh: Math.round(estimate * 1.07),
    source: "mock",
    fetchedAt: new Date().toISOString(),
  };
}

export async function getValuoEstimate(input: ValuoInput): Promise<ValuoEstimate> {
  if (process.env.VALUO_API_KEY) {
    try {
      return await fetchValuoReal(input);
    } catch {
      // Fallback na mock při chybě API
    }
  }
  return computeMockEstimate(input);
}
