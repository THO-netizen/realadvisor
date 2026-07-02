import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "crypto";
import { ListingForScoring, ScoringResult, ScoringService } from "./scoring.service";
import { CalculateScoreDto } from "./dto/calculate-score.dto";

@ApiTags("Scoring")
@Controller("scoring")
export class ScoringController {
  constructor(private readonly scoringService: ScoringService) {}

  @Post("calculate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Vypočte skóre inzerátu (bez uložení do DB)" })
  @ApiResponse({ status: 200, description: "Skóre 0–100 + dílčí složky" })
  @ApiResponse({ status: 400, description: "Neplatný vstup" })
  async calculate(@Body() dto: CalculateScoreDto): Promise<ScoringResult> {
    const listing: ListingForScoring = {
      id:               dto.id ?? randomUUID(),
      price:            BigInt(Math.round(dto.price)),
      pricePerM2:       dto.pricePerM2 ?? null,
      usableArea:       dto.usableArea ?? null,
      ownershipType:    dto.ownershipType ?? null,
      condition:        dto.condition ?? null,
      energyLabel:      dto.energyLabel ?? null,
      floor:            dto.floor ?? null,
      gpsLat:           dto.gpsLat ?? null,
      gpsLng:           dto.gpsLng ?? null,
      municipality:     dto.municipality ?? null,
      disposition:      dto.disposition ?? null,
      rawShortText:     dto.rawShortText ?? null,
      hasLegalIssueFlag: dto.hasLegalIssueFlag ?? false,
      isAuctionFlag:    dto.isAuctionFlag ?? false,
    };

    return this.scoringService.calculateScore(listing);
  }
}
