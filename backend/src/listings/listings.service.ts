import { Injectable, Logger } from "@nestjs/common";
import { Listing, Prisma } from "@prisma/client";
import axios, { isAxiosError } from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { SCORING_VERSION, ScoringResult, ScoringService } from "../scoring/scoring.service";
import { ImportListingDto } from "./dto/import-listing.dto";

export type ScoreStatus = "scored" | "default";

export interface ImportResult {
  listing: SerializedListing;
  scoreStatus: ScoreStatus;
}

export type SerializedListing = Omit<Listing, "price"> & { price: string };

const FALLBACK_SCORE: Omit<Prisma.ListingScoreCreateInput, "listing"> = {
  totalScore:      0,
  priceScore:      0,
  locationScore:   0,
  mortgageScore:   0,
  growthScore:     0,
  liquidityScore:  0,
  riskPenalty:     0,
  riskFlags:       ["SCORING_FAILED"],
  priceVsMedianPct: null,
  scoringVersion:  SCORING_VERSION,
  calculatedAt:    new Date(),
};

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  async importListing(dto: ImportListingDto): Promise<ImportResult> {
    const listing = await this.createListing(dto);
    void this.geocodeAndPersist(listing);
    const scoreStatus = await this.scoreAndPersist(listing);
    return { listing: this.serialize(listing), scoreStatus };
  }

  private async geocodeAndPersist(listing: Listing): Promise<void> {
    if ((listing.gpsLat && listing.gpsLng) || !listing.addressText) return;

    this.logger.log(`Calling Nominatim for address: ${listing.addressText}`);

    try {
      const q = encodeURIComponent(listing.addressText);
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${q}&format=json&limit=1&countrycodes=cz&accept-language=cs`;

      const { data } = await axios.get<Array<{ lat: string; lon: string }>>(url, {
        headers: { "User-Agent": "RealAdvisor/1.0 (majkoslav111@gmail.com)" },
        timeout: 8_000,
      });

      if (!data.length) {
        this.logger.warn(`Nominatim: žádný výsledek pro: ${listing.addressText}`);
        return;
      }

      const gpsLat = parseFloat(data[0].lat);
      const gpsLng = parseFloat(data[0].lon);

      await this.prisma.listing.update({
        where: { id: listing.id },
        data: { gpsLat, gpsLng },
      });

      this.logger.log(`Nominatim OK [${listing.id}]: ${listing.addressText} → ${gpsLat}, ${gpsLng}`);
    } catch (err) {
      if (isAxiosError(err)) {
        this.logger.warn(
          `Nominatim selhalo pro ${listing.id}: HTTP ${err.response?.status ?? "N/A"} — ` +
          `${JSON.stringify(err.response?.data ?? err.message)}`,
        );
      } else {
        this.logger.warn(`Nominatim selhalo pro ${listing.id}: ${(err as Error).message}`);
      }
    }
  }

  private async createListing(dto: ImportListingDto): Promise<Listing> {
    const now = new Date();

    const data: Prisma.ListingCreateInput = {
      source:           dto.source,
      sourceUrl:        dto.sourceUrl,
      externalId:       dto.externalId ?? null,
      title:            dto.title,
      price:            BigInt(Math.round(dto.price)),
      pricePerM2:       dto.pricePerM2 ?? null,
      disposition:      dto.disposition ?? null,
      usableArea:       dto.usableArea ?? null,
      landArea:         dto.landArea ?? null,
      ownershipType:    dto.ownershipType ?? null,
      propertyType:     dto.propertyType ?? null,
      condition:        dto.condition ?? null,
      constructionType: dto.constructionType ?? null,
      floor:            dto.floor ?? null,
      totalFloors:      dto.totalFloors ?? null,
      elevator:         dto.elevator ?? null,
      balcony:          dto.balcony ?? null,
      terrace:          dto.terrace ?? null,
      cellar:           dto.cellar ?? null,
      parking:          dto.parking ?? null,
      garden:           dto.garden ?? null,
      energyLabel:      dto.energyLabel ?? null,
      monthlyFees:      dto.monthlyFees ?? null,
      addressText:      dto.addressText ?? null,
      gpsLat:           dto.gpsLat ?? null,
      gpsLng:           dto.gpsLng ?? null,
      district:         dto.district ?? null,
      municipality:     dto.municipality ?? null,
      municipalityPart: dto.municipalityPart ?? null,
      cadastralArea:    dto.cadastralArea ?? null,
      firstSeenAt:      dto.firstSeenAt ? new Date(dto.firstSeenAt) : now,
      lastSeenAt:       dto.lastSeenAt  ? new Date(dto.lastSeenAt)  : now,
      rawShortText:     dto.rawShortText ?? null,
      statusActive:     true,
    };

    return this.prisma.listing.create({ data });
  }

  private async scoreAndPersist(listing: Listing): Promise<ScoreStatus> {
    try {
      const result = await this.scoring.calculateScore(listing);
      await this.persistScore(listing.id, result);
      return "scored";
    } catch (err) {
      this.logger.error(`Scoring selhal pro listing ${listing.id}: ${(err as Error).message}`);
      await this.persistFallbackScore(listing.id);
      return "default";
    }
  }

  private async persistScore(listingId: string, result: ScoringResult): Promise<void> {
    const scoreData = {
      totalScore:       result.totalScore,
      priceScore:       result.priceScore,
      locationScore:    result.locationScore,
      mortgageScore:    result.mortgageScore,
      growthScore:      result.growthScore,
      liquidityScore:   result.liquidityScore,
      riskPenalty:      result.riskPenalty,
      riskFlags:        result.riskFlags,
      priceVsMedianPct: result.priceVsMedianPct,
      scoringVersion:   result.scoringVersion,
      calculatedAt:     result.calculatedAt,
    };

    await this.prisma.listingScore.upsert({
      where:  { listingId },
      create: { listing: { connect: { id: listingId } }, ...scoreData },
      update: scoreData,
    });
  }

  private async persistFallbackScore(listingId: string): Promise<void> {
    const fallback = { ...FALLBACK_SCORE, calculatedAt: new Date() };
    try {
      await this.prisma.listingScore.upsert({
        where:  { listingId },
        create: { listing: { connect: { id: listingId } }, ...fallback },
        update: fallback,
      });
    } catch (err) {
      this.logger.error(`Fallback skóre selhalo pro listing ${listingId}: ${(err as Error).message}`);
    }
  }

  private serialize(listing: Listing): SerializedListing {
    return { ...listing, price: listing.price.toString() };
  }
}
