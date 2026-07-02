// Analytické jádro — přímé porovnání ceny inzerátu s tržním mediánem Reas.
// Žádná pravděpodobnostní distribuce, žádné E[P]/Var(P).

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  url: string;
  title: string;
  price: number;
  usableArea: number | null;
  listingPricePerM2: number | null;
  reasMedianPerM2: number | null;
  diffPct: number | null;
  direction: "below" | "above" | "at_market" | null;
  reasDataAvailable: boolean;
  disposition: string | null;
  condition: string | null;
  municipality: string | null;
  analyzedAt: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Výpočet
// ---------------------------------------------------------------------------

export function buildAnalysisResult(params: {
  url: string;
  title: string;
  price: number;
  usableArea: number | null;
  pricePerM2: number | null;
  disposition: string | null;
  condition: string | null;
  municipality: string | null;
  medianPricePerM2: number | null;
  reasDataAvailable: boolean;
  warnings: string[];
}): AnalysisResult {
  const listingPricePerM2 =
    params.pricePerM2 ??
    (params.usableArea && params.usableArea > 0
      ? Math.round(params.price / params.usableArea)
      : null);

  let diffPct: number | null = null;
  let direction: AnalysisResult["direction"] = null;

  if (listingPricePerM2 && params.medianPricePerM2 && params.medianPricePerM2 > 0) {
    // Kladné = pod tržní cenou, záporné = předraženo
    diffPct =
      Math.round(
        ((params.medianPricePerM2 - listingPricePerM2) / params.medianPricePerM2) * 1000
      ) / 10;
    direction = diffPct > 5 ? "below" : diffPct < -5 ? "above" : "at_market";
  }

  return {
    url: params.url,
    title: params.title,
    price: params.price,
    usableArea: params.usableArea,
    listingPricePerM2,
    reasMedianPerM2: params.medianPricePerM2,
    diffPct,
    direction,
    reasDataAvailable: params.reasDataAvailable,
    disposition: params.disposition,
    condition: params.condition,
    municipality: params.municipality,
    analyzedAt: new Date().toISOString(),
    warnings: params.warnings,
  };
}
