import { Injectable, Logger } from "@nestjs/common";
import { ReasService } from "./reas.service";

export const SCORING_VERSION = "1.0.0";

export interface ListingForScoring {
  id: string;
  price: bigint;
  pricePerM2: number | null;
  usableArea: { toNumber(): number } | number | null;
  ownershipType: "OV" | "DV" | "OTHER" | null;
  condition: "NEW" | "GOOD" | "AVERAGE" | "BAD" | "RECONSTRUCTION" | null;
  energyLabel: string | null;
  floor: number | null;
  gpsLat: { toNumber(): number } | number | null;
  gpsLng: { toNumber(): number } | number | null;
  municipality: string | null;
  disposition: string | null;
  rawShortText: string | null;
  hasLegalIssueFlag?: boolean;
  isAuctionFlag?: boolean;
}

export interface ScoringInput {
  pricePerM2: number;
  medianLocalityPricePerM2: number | null;
  priceTrend30Days: number | null;
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
  scoringVersion: string;
  calculatedAt: Date;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  private readonly WEIGHTS = {
    price: 0.3,
    location: 0.25,
    mortgage: 0.2,
    growth: 0.15,
    liquidity: 0.1,
  } as const;

  constructor(private readonly reas: ReasService) {}

  async calculateScore(listing: ListingForScoring): Promise<ScoringResult> {
    const lat = this.toNumber(listing.gpsLat);
    const lng = this.toNumber(listing.gpsLng);
    const usableAreaM2 = this.toNumber(listing.usableArea);

    this.logger.log(
      `Calling Reas getMarketData for listing: ${listing.id}, municipality: ${listing.municipality ?? "N/A"}`,
    );

    let medianPricePerM2: number | null = null;
    try {
      const marketData = await this.reas.getMarketData({
        lat,
        lng,
        municipality: listing.municipality,
        disposition: listing.disposition,
        usableAreaM2,
      });
      medianPricePerM2 = marketData?.medianPricePerM2 ?? null;
      this.logger.log(
        `Reas getMarketData result for ${listing.id}: medianPricePerM2=${medianPricePerM2 ?? "null"}, source=${marketData?.source ?? "null"}`,
      );
    } catch (err) {
      this.logger.error(`Reas getMarketData selhalo pro listing ${listing.id}: ${(err as Error).message}`);
    }

    const input: ScoringInput = {
      pricePerM2:              this.resolvePricePerM2(listing, usableAreaM2),
      medianLocalityPricePerM2: medianPricePerM2,
      priceTrend30Days:        null,
      metroWalkMinutes:        null,
      mhdWalkMinutes:          null,
      poiCount500m:            null,
      inDevelopmentZone:       false,
      nearPlannedInfra:        false,
      ownershipType:           listing.ownershipType ?? "OTHER",
      condition:               listing.condition ?? null,
      energyLabel:             listing.energyLabel ?? null,
      floor:                   listing.floor ?? null,
      hasLegalIssueFlag:       listing.hasLegalIssueFlag ?? false,
      isAuctionFlag:           listing.isAuctionFlag ?? false,
      rawShortTextLength:      listing.rawShortText?.length ?? 0,
      priceDrop30DaysPct:      null,
    };

    return this.computeScores(input);
  }

  private computeScores(input: ScoringInput): ScoringResult {
    const priceScore    = this.calcPriceScore(input);
    const locationScore = this.calcLocationScore(input);
    const mortgageScore = this.calcMortgageScore(input);
    const growthScore   = this.calcGrowthScore(input);
    const liquidityScore = this.calcLiquidityScore();
    const { penalty, flags } = this.calcRiskPenalty(input);

    const weighted =
      priceScore    * this.WEIGHTS.price    +
      locationScore * this.WEIGHTS.location +
      mortgageScore * this.WEIGHTS.mortgage +
      growthScore   * this.WEIGHTS.growth   +
      liquidityScore * this.WEIGHTS.liquidity;

    const totalScore = Math.max(0, Math.min(100, Math.round(weighted - penalty)));

    const priceVsMedianPct =
      input.medianLocalityPricePerM2 !== null
        ? Math.round(((input.pricePerM2 - input.medianLocalityPricePerM2) / input.medianLocalityPricePerM2) * 10000) / 100
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
      scoringVersion: SCORING_VERSION,
      calculatedAt: new Date(),
    };
  }

  private calcPriceScore(input: ScoringInput): number {
    if (input.medianLocalityPricePerM2 === null) return 50;

    const ratio = input.pricePerM2 / input.medianLocalityPricePerM2;
    let score: number;

    if (ratio < 0.85)      score = 95;
    else if (ratio < 1.0)  score = 80;
    else if (ratio < 1.15) score = 60;
    else if (ratio < 1.3)  score = 40;
    else                   score = 15;

    if (input.priceTrend30Days !== null && input.priceTrend30Days < 0) {
      score = Math.min(100, score + 5);
    }

    return score;
  }

  private calcLocationScore(input: ScoringInput): number {
    let mhdScore = 20;

    if (input.metroWalkMinutes !== null) {
      const m = input.metroWalkMinutes;
      if (m < 5)      mhdScore = 100;
      else if (m < 10) mhdScore = 80;
      else if (m < 15) mhdScore = 60;
      else if (m < 20) mhdScore = 40;
    } else if (input.mhdWalkMinutes !== null) {
      const m = input.mhdWalkMinutes;
      if (m < 5)      mhdScore = 80;
      else if (m < 10) mhdScore = 60;
      else if (m < 15) mhdScore = 40;
    }

    const poiScore = input.poiCount500m !== null
      ? Math.min(100, Math.round((input.poiCount500m / 30) * 100))
      : 50;

    let devScore = 5;
    if (input.inDevelopmentZone) devScore += 30;
    if (input.nearPlannedInfra)  devScore += 20;

    return Math.round(mhdScore * 0.4 + poiScore * 0.3 + devScore * 0.3);
  }

  private calcMortgageScore(input: ScoringInput): number {
    const ownershipScore =
      input.ownershipType === "OV" ? 100 :
      input.ownershipType === "DV" ? 50  : 30;

    const conditionScores: Record<string, number> = {
      NEW: 100, GOOD: 80, AVERAGE: 60, RECONSTRUCTION: 40, BAD: 20,
    };
    const conditionScore = input.condition ? (conditionScores[input.condition] ?? 50) : 50;

    const el = input.energyLabel;
    const energyBonus =
      el === "A" || el === "B" ? 10 :
      el === "E" || el === "F" || el === "G" ? -10 : 0;

    return Math.max(0, Math.min(100, Math.round((ownershipScore + conditionScore) / 2 + energyBonus)));
  }

  private calcGrowthScore(input: ScoringInput): number {
    let score = 40;
    if (input.inDevelopmentZone) score += 30;
    if (input.nearPlannedInfra)  score += 20;
    return Math.min(100, score);
  }

  private calcLiquidityScore(): number {
    return 50;
  }

  private calcRiskPenalty(input: ScoringInput): { penalty: number; flags: string[] } {
    let penalty = 0;
    const flags: string[] = [];

    if (input.ownershipType === "DV") {
      penalty += 15;
      flags.push("COOPERATIVE_OWNERSHIP");
    }

    if (input.medianLocalityPricePerM2 !== null && input.pricePerM2 / input.medianLocalityPricePerM2 > 1.3) {
      penalty += 20;
      flags.push("PRICE_ABOVE_MARKET_30PCT");
    }

    if (input.floor === 0 || input.floor === -1) {
      penalty += 8;
      flags.push("GROUND_FLOOR_OR_BASEMENT");
    }

    const el = input.energyLabel ?? "";
    if (["E", "F", "G"].includes(el)) {
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

  private toNumber(val: { toNumber(): number } | number | null | undefined): number | null {
    if (val === null || val === undefined) return null;
    return typeof val === "number" ? val : val.toNumber();
  }

  private resolvePricePerM2(listing: ListingForScoring, usableAreaM2: number | null): number {
    if (listing.pricePerM2) return listing.pricePerM2;
    if (usableAreaM2 && usableAreaM2 > 0) return Math.round(Number(listing.price) / usableAreaM2);
    return 0;
  }
}
