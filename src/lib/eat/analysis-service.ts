// EAT Direct-analysis pipeline
// Sekvenční pipeline dle spec:
// a) Sreality fetch (rate limit 2s)
// b) Valuo tržní odhad
// c) RÚIAN adresní ověření
// d) Uložení EATReport

import { importFromUrl } from "@/lib/import-service";
import { loadListings, getListingById } from "@/lib/listings-store";
import { calcLocalityStats } from "@/lib/stats";
import { getValuoEstimate } from "./valuo";
import { verifyAddressRUIAN } from "./ruian";
import { saveReport } from "./report-store";
import type { EATAnalyzeRequest, EATAnalyzeResponse } from "./types";

export async function analyzeUrl(
  req: EATAnalyzeRequest
): Promise<EATAnalyzeResponse> {
  // a) Import inzerátu (rate limit + scoring + Golemio uvnitř importFromUrl)
  const { listing } = await importFromUrl(req.url);

  // Reload pro případ že upsertListing vrátil cached verzi
  const freshListing = getListingById(listing.id) ?? listing;

  // Statistiky lokality (pro Valuo mock)
  const allListings = loadListings();
  const localityStats = freshListing.municipality
    ? calcLocalityStats(freshListing.municipality, allListings)
    : null;

  // b) Valuo tržní odhad (paralelně s c)
  const [valuoEstimate, ruian] = await Promise.all([
    getValuoEstimate({
      price: freshListing.price,
      usableArea: freshListing.usableArea,
      municipality: freshListing.municipality,
      disposition: freshListing.disposition,
      gpsLat: freshListing.gpsLat,
      gpsLng: freshListing.gpsLng,
      condition: freshListing.condition,
      localityMedianPricePerM2: localityStats?.medianPricePerM2 ?? null,
    }),
    // c) RÚIAN adresní ověření
    verifyAddressRUIAN(
      freshListing.addressText,
      freshListing.municipality,
      freshListing.gpsLat,
      freshListing.gpsLng
    ),
  ]);

  // d) Uložení reportu
  const report = saveReport({
    sourceUrl: req.url,
    clientName: req.clientName ?? null,
    advisorNotes: req.advisorNotes ?? null,
    listing: freshListing,
    score: freshListing.score,
    localityStats,
    valuoEstimate,
    ruian,
    status: "complete",
    error: null,
  });

  return { reportId: report.id, report };
}
