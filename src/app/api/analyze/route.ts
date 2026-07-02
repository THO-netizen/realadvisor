// POST /api/analyze
//
// Krok A: Scraping  → cena, plocha, adresa, GPS
// Krok B: Reas.cz   → tržní medián Kč/m² (+ národní fallback)
// Krok C: Model     → E[P], Var(P), verdikt

import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/import-service";
import { getReasPriceData } from "@/lib/reas-service";
import { buildAnalysisResult } from "@/lib/statistical-model";
import type { AnalysisResult } from "@/lib/statistical-model";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let url: string;
  try {
    const body = (await req.json()) as { url?: string };
    url = body.url?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json({ error: "URL je povinná." }, { status: 422 });
  }

  try {
    const warnings: string[] = [];
    console.log(`\n[analyze] ══ ${url} ══`);

    // ── Krok A: Scraping ─────────────────────────────────────────────────────
    const { metadata, robotsWarning } = await scrapeUrl(url);
    if (robotsWarning) warnings.push(robotsWarning);

    const municipality = metadata.municipality;
    const gpsLat = metadata.gpsLat;
    const gpsLng = metadata.gpsLng;

    console.log(
      `[analyze] ✓ Scraper — ${metadata.price.toLocaleString("cs-CZ")} Kč | ` +
      `${metadata.usableArea ?? "?"} m² | "${municipality ?? "?"}"`
    );

    // ── Krok B: Reas.cz ───────────────────────────────────────────────────────
    let medianPricePerM2: number | null = null;
    let reasDataAvailable = false;

    if (municipality || (gpsLat && gpsLng)) {
      try {
        const reasData = await getReasPriceData(municipality ?? "", gpsLat, gpsLng);
        if (reasData) {
          medianPricePerM2 = reasData.medianPricePerM2;
          reasDataAvailable = true;
          console.log(`[analyze] ✓ Reas — ${medianPricePerM2.toLocaleString("cs-CZ")} Kč/m²`);
        } else {
          warnings.push("Reas.cz: data nedostupná — použita národní cenová pásma.");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Reas.cz: ${msg}`);
      }
    } else {
      warnings.push("Neznámá lokalita — použita národní cenová pásma.");
    }

    if (!medianPricePerM2) {
      medianPricePerM2 = nationalFallback(municipality);
      if (medianPricePerM2) {
        console.log(`[analyze] Národní fallback: ${medianPricePerM2.toLocaleString("cs-CZ")} Kč/m²`);
      } else {
        warnings.push("Nelze odhadnout tržní cenu — chybí lokalita i GPS.");
      }
    }

    // ── Krok C: Statistický model ─────────────────────────────────────────────
    const result: AnalysisResult = buildAnalysisResult({
      url,
      title: metadata.title,
      price: metadata.price,
      usableArea: metadata.usableArea,
      pricePerM2: metadata.pricePerM2,
      disposition: metadata.disposition,
      condition: metadata.condition,
      municipality,
      medianPricePerM2,
      reasDataAvailable,
      warnings,
    });

    console.log(
      `[analyze] ══ Hotovo — Reas=${result.reasMedianPerM2?.toLocaleString("cs-CZ") ?? "N/A"} Kč/m²` +
      ` | diff=${result.diffPct?.toFixed(1) ?? "N/A"} % (${result.direction ?? "N/A"}) ══\n`
    );

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Neznámá chyba.";
    console.error(`[analyze] CHYBA: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// Národní cenová pásma — fallback
// ---------------------------------------------------------------------------

const PRICE_BANDS: [string, number][] = [
  ["Praha 1", 165_000], ["Praha 2", 148_000], ["Praha 6", 132_000],
  ["Praha 7", 128_000], ["Praha 5", 122_000], ["Praha 3", 120_000],
  ["Praha 10", 108_000], ["Praha 8", 115_000], ["Praha 4", 112_000],
  ["Praha 9", 105_000], ["Praha 11", 95_000], ["Praha 12", 92_000],
  ["Praha 13", 90_000], ["Praha 14", 88_000], ["Praha 15", 85_000],
  ["Praha", 120_000],
  ["Brno-střed", 98_000], ["Brno", 78_000],
  ["Ostrava", 40_000], ["Plzeň", 62_000], ["Liberec", 48_000],
  ["Olomouc", 55_000], ["Pardubice", 58_000], ["Hradec Králové", 60_000],
  ["České Budějovice", 57_000], ["Zlín", 47_000], ["Ústí nad Labem", 28_000],
  ["Jihlava", 52_000], ["Kladno", 52_000], ["Karviná", 25_000],
  ["Teplice", 30_000], ["Opava", 38_000], ["Frýdek-Místek", 42_000],
  ["Most", 22_000],
];

function nationalFallback(municipality: string | null): number | null {
  if (!municipality) return null;
  const lower = municipality.toLowerCase();
  let best: [string, number] | null = null;
  for (const [name, price] of PRICE_BANDS) {
    if (lower.includes(name.toLowerCase())) {
      if (!best || name.length > best[0].length) best = [name, price];
    }
  }
  return best?.[1] ?? null;
}
