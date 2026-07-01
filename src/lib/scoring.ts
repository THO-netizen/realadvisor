// Scoringový model dle specifikace §5
// Celkové skóre = Σ(dimenze × váha) − penalizace
// Cena 30 % | Lokalita 25 % | Hypotéka 20 % | Růst 15 % | Likvidita 10 %

export interface ScoringInput {
  // Cena
  price: number;
  usableArea: number | null;
  pricePerM2: number | null;
  medianLocalityPricePerM2: number | null;
  priceTrend30DaysPct: number | null; // záporné = pokles

  // Lokalita
  metroWalkMinutes: number | null;
  mhdWalkMinutes: number | null;
  poiCount500m: number | null;
  inDevelopmentZone: boolean;
  nearPlannedInfra: boolean;

  // Hypoteční vhodnost
  ownershipType: "OV" | "DV" | "OTHER" | null;
  condition: "NEW" | "GOOD" | "AVERAGE" | "BAD" | "RECONSTRUCTION" | null;
  energyLabel: string | null;
  ltvRatio: number | null; // 0–1, např. 0.8 = 80 % LTV

  // Růstový potenciál (pro MVP defaulty, v Fázi 3 z historických dat)
  historicalGrowthPct: number | null;

  // Likvidita
  avgDaysOnMarket: number | null;

  // Risk flags
  floor: number | null;
  hasLegalIssueFlag: boolean;
  isAuctionFlag: boolean;
  rawShortTextLength: number;
  priceDrop30DaysPct: number | null;
}

export interface ScoreResult {
  total: number;
  price: number;
  location: number;
  mortgage: number;
  growth: number;
  liquidity: number;
  penalty: number;
  flags: RiskFlag[];
  priceVsMedianPct: number | null;
  label: ScoreLabel;
  labelColor: string;
  version: string;
}

export type RiskFlag =
  | "COOPERATIVE_OWNERSHIP"
  | "PRICE_ABOVE_MARKET_30PCT"
  | "MISSING_GPS"
  | "GROUND_FLOOR_OR_BASEMENT"
  | "POOR_ENERGY_LABEL"
  | "ATYPICAL_DISPOSITION"
  | "LEGAL_ISSUE_DETECTED"
  | "AUCTION"
  | "VERY_SHORT_DESCRIPTION"
  | "STEEP_PRICE_DROP";

export type ScoreLabel =
  | "Výborná příležitost"
  | "Dobrá nabídka"
  | "Průměrná nabídka"
  | "Pod průměrem"
  | "Nevhodné";

const WEIGHTS = {
  price: 0.30,
  location: 0.25,
  mortgage: 0.20,
  growth: 0.15,
  liquidity: 0.10,
} as const;

// ---------------------------------------------------------------------------
// Dimenze
// ---------------------------------------------------------------------------

function calcPriceScore(input: ScoringInput): number {
  // Pokud nemáme median ani pricePerM2, vrátíme neutrální skóre
  if (input.medianLocalityPricePerM2 === null || !input.pricePerM2) return 50;

  const ratio = input.pricePerM2 / input.medianLocalityPricePerM2;
  let score: number;

  if (ratio < 0.85) score = 95;
  else if (ratio < 1.0) score = 80;
  else if (ratio < 1.15) score = 60;
  else if (ratio < 1.3) score = 40;
  else score = 15;

  // Bonus za pokles ceny v posledních 30 dnech
  if (input.priceTrend30DaysPct !== null && input.priceTrend30DaysPct < 0) {
    score = Math.min(100, score + 5);
  }

  return score;
}

function calcLocationScore(input: ScoringInput): number {
  // MHD dostupnost (40 %)
  let mhdScore = 30; // default bez dat
  const metro = input.metroWalkMinutes;
  if (metro !== null) {
    if (metro < 5) mhdScore = 100;
    else if (metro < 10) mhdScore = 80;
    else if (metro < 15) mhdScore = 60;
    else if (metro < 20) mhdScore = 40;
    else mhdScore = 20;
  } else if (input.mhdWalkMinutes !== null) {
    const mhd = input.mhdWalkMinutes;
    if (mhd < 5) mhdScore = 80;
    else if (mhd < 10) mhdScore = 60;
    else if (mhd < 15) mhdScore = 40;
    else mhdScore = 25;
  }

  // Občanská vybavenost (30 %)
  const poiScore =
    input.poiCount500m !== null
      ? Math.min(100, Math.round((input.poiCount500m / 30) * 100))
      : 50;

  // Rozvojový potenciál (30 %)
  let devScore = 10;
  if (input.inDevelopmentZone) devScore += 30;
  if (input.nearPlannedInfra) devScore += 20;
  devScore = Math.min(100, devScore);

  return Math.round(mhdScore * 0.4 + poiScore * 0.3 + devScore * 0.3);
}

function calcMortgageScore(input: ScoringInput): number {
  // Typ vlastnictví
  let ownershipScore = 50;
  if (input.ownershipType === "OV") ownershipScore = 100;
  else if (input.ownershipType === "DV") ownershipScore = 50;
  else if (input.ownershipType === "OTHER") ownershipScore = 30;

  // Stav nemovitosti
  const conditionMap: Record<string, number> = {
    NEW: 100, GOOD: 80, AVERAGE: 60, RECONSTRUCTION: 40, BAD: 20,
  };
  const conditionScore = input.condition ? (conditionMap[input.condition] ?? 50) : 50;

  // LTV
  let ltvScore = 75; // default
  if (input.ltvRatio !== null) {
    if (input.ltvRatio < 0.8) ltvScore = 100;
    else if (input.ltvRatio <= 0.9) ltvScore = 75;
    else ltvScore = 40;
  }

  // Energetická třída
  let energyBonus = 0;
  const el = input.energyLabel?.toUpperCase();
  if (el === "A" || el === "B") energyBonus = 10;
  else if (el === "E" || el === "F" || el === "G") energyBonus = -10;

  const base = Math.round((ownershipScore + conditionScore + ltvScore) / 3);
  return Math.max(0, Math.min(100, base + energyBonus));
}

function calcGrowthScore(input: ScoringInput): number {
  let score = 40;
  if (input.inDevelopmentZone) score += 30;
  if (input.nearPlannedInfra) score += 20;
  if (input.historicalGrowthPct !== null) {
    // Každé 1 % historického růstu ročně = +1 bod (max +20)
    score += Math.min(20, Math.round(input.historicalGrowthPct));
  }
  return Math.min(100, score);
}

function calcLiquidityScore(input: ScoringInput): number {
  if (input.avgDaysOnMarket === null) return 50;
  // <30 dní = vysoká likvidita
  if (input.avgDaysOnMarket < 30) return 90;
  if (input.avgDaysOnMarket < 60) return 70;
  if (input.avgDaysOnMarket < 90) return 50;
  if (input.avgDaysOnMarket < 180) return 30;
  return 15;
}

// ---------------------------------------------------------------------------
// Penalizace za rizika (§5.2.4)
// ---------------------------------------------------------------------------

function calcPenalty(input: ScoringInput): { penalty: number; flags: RiskFlag[] } {
  let penalty = 0;
  const flags: RiskFlag[] = [];

  if (input.ownershipType === "DV") {
    penalty += 15;
    flags.push("COOPERATIVE_OWNERSHIP");
  }

  const ratio =
    input.pricePerM2 && input.medianLocalityPricePerM2
      ? input.pricePerM2 / input.medianLocalityPricePerM2
      : null;

  if (ratio !== null && ratio > 1.3) {
    penalty += 20;
    flags.push("PRICE_ABOVE_MARKET_30PCT");
  }

  if (input.floor === 0 || input.floor === -1) {
    penalty += 8;
    flags.push("GROUND_FLOOR_OR_BASEMENT");
  }

  const el = input.energyLabel?.toUpperCase();
  if (el && ["E", "F", "G"].includes(el)) {
    penalty += 10;
    flags.push("POOR_ENERGY_LABEL");
  }

  if (input.hasLegalIssueFlag) {
    penalty += 20;
    flags.push("LEGAL_ISSUE_DETECTED");
  }

  if (input.isAuctionFlag) {
    penalty += 15;
    flags.push("AUCTION");
  }

  if (input.rawShortTextLength < 100) {
    penalty += 5;
    flags.push("VERY_SHORT_DESCRIPTION");
  }

  if (input.priceDrop30DaysPct !== null && input.priceDrop30DaysPct < -15) {
    penalty += 8;
    flags.push("STEEP_PRICE_DROP");
  }

  return { penalty, flags };
}

// ---------------------------------------------------------------------------
// Interpretace skóre (§5.3)
// ---------------------------------------------------------------------------

function toLabel(score: number): { label: ScoreLabel; color: string } {
  if (score >= 80) return { label: "Výborná příležitost", color: "emerald" };
  if (score >= 60) return { label: "Dobrá nabídka", color: "green" };
  if (score >= 40) return { label: "Průměrná nabídka", color: "yellow" };
  if (score >= 20) return { label: "Pod průměrem", color: "orange" };
  return { label: "Nevhodné", color: "red" };
}

// ---------------------------------------------------------------------------
// Hlavní export
// ---------------------------------------------------------------------------

export function calculateScore(input: ScoringInput): ScoreResult {
  const price = calcPriceScore(input);
  const location = calcLocationScore(input);
  const mortgage = calcMortgageScore(input);
  const growth = calcGrowthScore(input);
  const liquidity = calcLiquidityScore(input);

  const { penalty, flags } = calcPenalty(input);

  const weighted =
    price * WEIGHTS.price +
    location * WEIGHTS.location +
    mortgage * WEIGHTS.mortgage +
    growth * WEIGHTS.growth +
    liquidity * WEIGHTS.liquidity;

  const total = Math.max(0, Math.min(100, Math.round(weighted - penalty)));
  const { label, color } = toLabel(total);

  const priceVsMedianPct =
    input.pricePerM2 && input.medianLocalityPricePerM2
      ? Math.round(
          ((input.pricePerM2 - input.medianLocalityPricePerM2) /
            input.medianLocalityPricePerM2) *
            10000
        ) / 100
      : null;

  return {
    total,
    price,
    location,
    mortgage,
    growth,
    liquidity,
    penalty,
    flags,
    priceVsMedianPct,
    label,
    labelColor: color,
    version: "1.0",
  };
}

/** Vytvoří ScoringInput ze StoredListing + locality median. */
export function scoringInputFromListing(
  listing: {
    price: number;
    pricePerM2: number | null;
    usableArea: number | null;
    ownershipType?: string | null;
    condition?: string | null;
    energyLabel?: string | null;
    floor?: number | null;
    metroWalkMinutes?: number | null;
    mhdWalkMinutes?: number | null;
    poiCount500m?: number | null;
    rawShortTextLength?: number;
  },
  medianLocalityPricePerM2: number | null
): ScoringInput {
  return {
    price: listing.price,
    usableArea: listing.usableArea,
    pricePerM2: listing.pricePerM2,
    medianLocalityPricePerM2,
    priceTrend30DaysPct: null,
    metroWalkMinutes: listing.metroWalkMinutes ?? null,
    mhdWalkMinutes: listing.mhdWalkMinutes ?? null,
    poiCount500m: listing.poiCount500m ?? null,
    inDevelopmentZone: false,
    nearPlannedInfra: false,
    ownershipType: (listing.ownershipType as "OV" | "DV" | "OTHER") ?? null,
    condition:
      (listing.condition as
        | "NEW" | "GOOD" | "AVERAGE" | "BAD" | "RECONSTRUCTION"
        | null) ?? null,
    energyLabel: listing.energyLabel ?? null,
    ltvRatio: null,
    historicalGrowthPct: null,
    avgDaysOnMarket: null,
    floor: listing.floor ?? null,
    hasLegalIssueFlag: false,
    isAuctionFlag: false,
    rawShortTextLength: listing.rawShortTextLength ?? 0,
    priceDrop30DaysPct: null,
  };
}
