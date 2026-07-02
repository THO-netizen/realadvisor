import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ImportListingDto } from "./dto/import-listing.dto";
import { ImportResult, ListingsService } from "./listings.service";

@ApiTags("Listings")
@Controller("listings")
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  /**
   * Importuje inzerát, uloží do DB a spustí scoring.
   * Inzerát se vždy uloží — geocoding a scoring proběhnou asynchronně.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Import inzerátu + automatické skórování" })
  @ApiResponse({ status: 201, description: "Inzerát vytvořen, skóre vypočítáno" })
  @ApiResponse({ status: 400, description: "Neplatný vstup" })
  async importListing(@Body() dto: ImportListingDto): Promise<ImportResult> {
    return this.listingsService.importListing(dto);
  }
}
