import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { OwnershipType, PropertyCondition } from "@prisma/client";

export class CalculateScoreDto {
  @ApiPropertyOptional({ description: "ID inzerátu (vygeneruje se pokud chybí)" })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: "Cena v haléřích (5 000 000 Kč = 500 000 000)", example: 500_000_000 })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  pricePerM2?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  usableArea?: number;

  @ApiPropertyOptional({ enum: OwnershipType })
  @IsOptional()
  @IsEnum(OwnershipType)
  ownershipType?: OwnershipType;

  @ApiPropertyOptional({ enum: PropertyCondition })
  @IsOptional()
  @IsEnum(PropertyCondition)
  condition?: PropertyCondition;

  @ApiPropertyOptional({ example: "B" })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  energyLabel?: string;

  @ApiPropertyOptional({ description: "0 = přízemí, -1 = suterén" })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  floor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  gpsLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  gpsLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  municipality?: string;

  @ApiPropertyOptional({ example: "3+1" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  disposition?: string;

  @ApiPropertyOptional({ description: "Max 500 znaků" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rawShortText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasLegalIssueFlag?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAuctionFlag?: boolean;
}
