/**
 * Scoring Service — výpočet skóre 0–100 dle sekce 5 specifikace.
 * Připraven pro napojení na Prisma (listings, listing_scores).
 */

export interface ScoringInput {
  pricePerM2: number;
  medianLocalityPricePerM2: number | null;
  priceTrend30Days: number | null; // záporné = pokles
  metroWalkMinutes: number | null;
  mhdWalkMinutes: number | null;
  poiCount500m: number | null;
  inDevelopmentZone: boolean;
  nearPlannedInfra: boolean;
  ownershipType: "OV" | "DV" | "OTHER";
  condition: "NEW" | "GOOD" | "AVERAGE" | "BAD" | "RECONSTRUCTION" | null;
  energyLabel: string | null;
  floor: number | null;
  hasLegalIssueFlag: boolean;
  isAuctionFlag: boolean;
  rawShortTextLength: number;
  priceDrop30DaysPct: number | null;
}

export interface ScoringResult {
  totalScore: number;
  priceScore: number;
  locationScore: number;
  mortgageScore: number;
  growthScore: number;
  liquidityScore: number;
  riskPenalty: number;
  riskFlags: string[];
  priceVsMedianPct: number | null;
}

export class ScoringService {
  private readonly WEIGHTS = {
    price: 0.3,
    location: 0.25,
    mortgage: 0.2,
    growth: 0.15,
    liquidity: 0.1,
  };

  calculate(input: ScoringInput): ScoringResult {
    const priceScore = this.calcPriceScore(input);
    const locationScore = this.calcLocationScore(input);
    const mortgageScore = this.calcMortgageScore(input);
    const growthScore = this.calcGrowthScore(input);
    const liquidityScore = this.calcLiquidityScore(input);

    const { penalty, flags } = this.calcRiskPenalty(input);

    const weighted =
      priceScore * this.WEIGHTS.price +
      locationScore * this.WEIGHTS.location +
      mortgageScore * this.WEIGHTS.mortgage +
      growthScore * this.WEIGHTS.growth +
      liquidityScore * this.WEIGHTS.liquidity;

    const totalScore = Math.max(0, Math.min(100, Math.round(weighted - penalty)));

    const priceVsMedianPct =
      input.medianLocalityPricePerM2 !== null
        ? Math.round(
            ((input.pricePerM2 - input.medianLocalityPricePerM2) /
              input.medianLocalityPricePerM2) *
              100 *
              100
          ) / 100
        : null;

    return {
      totalScore,
      priceScore,
      locationScore,
      mortgageScore,
      growthScore,
      liquidityScore,
      riskPenalty: penalty,
      riskFlags: flags,
      priceVsMedianPct,
    };
  }

  private calcPriceScore(input: ScoringInput): number {
    if (input.medianLocalityPricePerM2 === null) return 50;

    const ratio = input.pricePerM2 / input.medianLocalityPricePerM2;
    let score: number;

    if (ratio < 0.85) score = 95;
    else if (ratio < 1.0) score = 80;
    else if (ratio < 1.15) score = 60;
    else if (ratio < 1.3) score = 40;
    else score = 15;

    // Bonus za pokles ceny v posledních 30 dnech
    if (input.priceTrend30Days !== null && input.priceTrend30Days < 0) {
      score = Math.min(100, score + 5);
    }

    return score;
  }

  private calcLocationScore(input: ScoringInput): number {
    // MHD dostupnost (40 %)
    let mhdScore = 20;
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
      else mhdScore = 20;
    }

    // Občanská vybavenost (30 %)
    const poiScore =
      input.poiCount500m !== null
        ? Math.min(100, Math.round((input.poiCount500m / 30) * 100))
        : 50;

    // Rozvojový potenciál (30 %)
    let developmentScore = 5;
    if (input.inDevelopmentZone) developmentScore += 30;
    if (input.nearPlannedInfra) developmentScore += 20;

    return Math.round(
      mhdScore * 0.4 + poiScore * 0.3 + developmentScore * 0.3
    );
  }

  private calcMortgageScore(input: ScoringInput): number {
    let score = 0;

    // Typ vlastnictví
    if (input.ownershipType === "OV") score += 100;
    else if (input.ownershipType === "DV") score += 50;
    else score += 30;

    // Stav nemovitosti
    const conditionScores: Record<string, number> = {
      NEW: 100,
      GOOD: 80,
      AVERAGE: 60,
      RECONSTRUCTION: 40,
      BAD: 20,
    };
    const conditionScore = input.condition
      ? (conditionScores[input.condition] ?? 50)
      : 50;

    // Energetická třída
    let energyBonus = 0;
    if (input.energyLabel === "A" || input.energyLabel === "B")
      energyBonus = 10;
    else if (input.energyLabel === "E" || input.energyLabel === "F" || input.energyLabel === "G")
      energyBonus = -10;

    return Math.max(0, Math.min(100, Math.round((score + conditionScore) / 2 + energyBonus)));
  }

  private calcGrowthScore(input: ScoringInput): number {
    let score = 40;
    if (input.inDevelopmentZone) score += 30;
    if (input.nearPlannedInfra) score += 20;
    return Math.min(100, score);
  }

  private calcLiquidityScore(input: ScoringInput): number {
    // Zjednodušený výpočet pro MVP — rozšíří se v Fázi 3
    return 50;
  }

  private calcRiskPenalty(input: ScoringInput): { penalty: number; flags: string[] } {
    let penalty = 0;
    const flags: string[] = [];

    if (input.ownershipType === "DV") {
      penalty += 15;
      flags.push("COOPERATIVE_OWNERSHIP");
    }

    if (
      input.medianLocalityPricePerM2 !== null &&
      input.pricePerM2 / input.medianLocalityPricePerM2 > 1.3
    ) {
      penalty += 20;
      flags.push("PRICE_ABOVE_MARKET_30PCT");
    }

    if (input.floor === 0 || input.floor === -1) {
      penalty += 8;
      flags.push("GROUND_FLOOR_OR_BASEMENT");
    }

    if (["E", "F", "G"].includes(input.energyLabel ?? "")) {
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
}
