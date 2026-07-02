import {
  IsBoolean,
  IsDateString,
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
import {
  ConstructionType,
  OwnershipType,
  ParkingType,
  PropertyCondition,
  PropertyType,
} from "@prisma/client";
import { z } from "zod";

export const ImportListingSchema = z.object({
  source:           z.string().min(1).max(50),
  sourceUrl:        z.string().url().max(2000),
  externalId:       z.string().max(100).optional(),
  title:            z.string().min(1).max(300),
  price:            z.number().int().positive(),
  pricePerM2:       z.number().int().positive().optional(),
  disposition:      z.string().max(20).optional(),
  usableArea:       z.number().positive().optional(),
  landArea:         z.number().positive().optional(),
  ownershipType:    z.nativeEnum(OwnershipType).optional(),
  propertyType:     z.nativeEnum(PropertyType).optional(),
  condition:        z.nativeEnum(PropertyCondition).optional(),
  constructionType: z.nativeEnum(ConstructionType).optional(),
  floor:            z.number().int().optional(),
  totalFloors:      z.number().int().min(1).optional(),
  elevator:         z.boolean().optional(),
  balcony:          z.boolean().optional(),
  terrace:          z.boolean().optional(),
  cellar:           z.boolean().optional(),
  parking:          z.nativeEnum(ParkingType).optional(),
  garden:           z.boolean().optional(),
  energyLabel:      z.string().max(1).optional(),
  monthlyFees:      z.number().int().min(0).optional(),
  addressText:      z.string().max(500).optional(),
  gpsLat:           z.number().min(-90).max(90).optional(),
  gpsLng:           z.number().min(-180).max(180).optional(),
  district:         z.string().max(100).optional(),
  municipality:     z.string().max(100).optional(),
  municipalityPart: z.string().max(100).optional(),
  cadastralArea:    z.string().max(100).optional(),
  firstSeenAt:      z.string().datetime().optional(),
  lastSeenAt:       z.string().datetime().optional(),
  rawShortText:     z.string().max(500).optional(),
});

export type ImportListingInput = z.infer<typeof ImportListingSchema>;

export class ImportListingDto {
  @ApiProperty({ example: "sreality" })
  @IsString()
  @MaxLength(50)
  source: string;

  @ApiProperty({ example: "https://www.sreality.cz/detail/..." })
  @IsString()
  @MaxLength(2000)
  sourceUrl: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalId?: string;

  @ApiProperty({ example: "Prodej bytu 3+1, Praha 6" })
  @IsString()
  @MaxLength(300)
  title: string;

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

  @ApiPropertyOptional({ example: "3+1" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  disposition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  usableArea?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  landArea?: number;

  @ApiPropertyOptional({ enum: OwnershipType })
  @IsOptional()
  @IsEnum(OwnershipType)
  ownershipType?: OwnershipType;

  @ApiPropertyOptional({ enum: PropertyType })
  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @ApiPropertyOptional({ enum: PropertyCondition })
  @IsOptional()
  @IsEnum(PropertyCondition)
  condition?: PropertyCondition;

  @ApiPropertyOptional({ enum: ConstructionType })
  @IsOptional()
  @IsEnum(ConstructionType)
  constructionType?: ConstructionType;

  @ApiPropertyOptional({ description: "0 = přízemí, -1 = suterén" })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  floor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  totalFloors?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  elevator?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  balcony?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  terrace?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cellar?: boolean;

  @ApiPropertyOptional({ enum: ParkingType })
  @IsOptional()
  @IsEnum(ParkingType)
  parking?: ParkingType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  garden?: boolean;

  @ApiPropertyOptional({ example: "B" })
  @IsOptional()
  @IsString()
  @MaxLength(1)
  energyLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  monthlyFees?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressText?: string;

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
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  municipality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  municipalityPart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cadastralArea?: string;

  @ApiPropertyOptional({ description: "ISO 8601" })
  @IsOptional()
  @IsDateString()
  firstSeenAt?: string;

  @ApiPropertyOptional({ description: "ISO 8601" })
  @IsOptional()
  @IsDateString()
  lastSeenAt?: string;

  @ApiPropertyOptional({ description: "Max 500 znaků — nikdy plný text inzerátu" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rawShortText?: string;
}
