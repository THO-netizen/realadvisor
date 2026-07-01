// Statistické funkce pro výpočet mediánu, variance a percentilového pořadí
// Používá scoring model pro porovnání ceny nemovitosti s trhem v lokalitě

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function variance(values: number[]): number | null {
  if (values.length < 2) return null;
  const avg = mean(values)!;
  return values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
}

export function stdDev(values: number[]): number | null {
  const v = variance(values);
  return v !== null ? Math.sqrt(v) : null;
}

/** Percentilové pořadí hodnoty v distribuci (0–100). */
export function percentileRank(value: number, distribution: number[]): number {
  if (distribution.length === 0) return 50;
  const below = distribution.filter((v) => v < value).length;
  return Math.round((below / distribution.length) * 100);
}

export interface LocalityStats {
  municipality: string;
  count: number;
  medianPricePerM2: number | null;
  meanPricePerM2: number | null;
  stdDevPricePerM2: number | null;
  medianPrice: number | null;
  minPricePerM2: number | null;
  maxPricePerM2: number | null;
}

export interface LocalityItem {
  municipality: string | null;
  pricePerM2: number | null;
  price: number;
}

/** Výpočet statistik lokality z dostupných inzerátů. */
export function calcLocalityStats(
  municipality: string,
  items: LocalityItem[]
): LocalityStats {
  const relevant = items.filter(
    (i) =>
      i.municipality?.toLowerCase() === municipality.toLowerCase() &&
      i.pricePerM2 !== null &&
      i.pricePerM2 > 0
  );

  const pricesPerM2 = relevant
    .map((i) => i.pricePerM2!)
    .filter((p) => p > 0);

  const prices = relevant.map((i) => i.price).filter((p) => p > 0);

  return {
    municipality,
    count: relevant.length,
    medianPricePerM2: median(pricesPerM2),
    meanPricePerM2: mean(pricesPerM2),
    stdDevPricePerM2: stdDev(pricesPerM2),
    medianPrice: median(prices),
    minPricePerM2: pricesPerM2.length ? Math.min(...pricesPerM2) : null,
    maxPricePerM2: pricesPerM2.length ? Math.max(...pricesPerM2) : null,
  };
}
