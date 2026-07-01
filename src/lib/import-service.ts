// Unified import service — obálka nad source-specific fetchery
// Přidává: blacklist check, robots.txt, rate limit, scoring, Golemio data

import { validateSrealityUrl, fetchSrealityMetadata } from "./sreality";
import { isAllowedByRobots } from "./robots-checker";
import { enforceRateLimit } from "./rate-limiter";
import { isBlacklisted } from "./source-blacklist";
import { upsertListing, loadListings, type UpsertInput } from "./listings-store";
import { calculateScore, scoringInputFromListing } from "./scoring";
import { calcLocalityStats } from "./stats";
import { getTransitData } from "./golemio";

export interface ImportResult {
  listing: Awaited<ReturnType<typeof upsertListing>>;
  robotsWarning: string | null;
}

export async function importFromUrl(rawUrl: string): Promise<ImportResult> {
  // 1. Blacklist check
  if (isBlacklisted(rawUrl)) {
    throw new Error(
      "Tento zdroj je na blacklistu. Portál explicitně zakázal automatizovaný přístup."
    );
  }

  // 2. Validace URL (Sreality — primární zdroj)
  const validation = validateSrealityUrl(rawUrl);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Neplatná URL.");
  }

  // 3. Robots.txt check (neblokující pro ruční import)
  const robotsAllowed = await isAllowedByRobots(rawUrl);

  // 4. Rate limit
  await enforceRateLimit("sreality.cz");

  // 5. Stažení metadat
  const metadata = await fetchSrealityMetadata(rawUrl);

  // 6. Golemio MHD data (pokud máme GPS)
  let metroWalkMinutes: number | null = null;
  let mhdWalkMinutes: number | null = null;
  if (metadata.gpsLat && metadata.gpsLng) {
    try {
      const transit = await getTransitData(metadata.gpsLat, metadata.gpsLng);
      metroWalkMinutes = transit.nearestMetroMinutes;
      mhdWalkMinutes = transit.nearestMhdMinutes;
    } catch {
      // Golemio je optional — neblokuje import
    }
  }

  // 7. Výpočet skóre
  const allListings = loadListings();
  const localityStats = metadata.municipality
    ? calcLocalityStats(metadata.municipality, allListings)
    : null;

  const scoringInput = scoringInputFromListing(
    {
      ...metadata,
      ownershipType: metadata.ownershipType ?? null,
      condition: metadata.condition ?? null,
      energyLabel: metadata.energyLabel ?? null,
      floor: metadata.floor ?? null,
      metroWalkMinutes,
      mhdWalkMinutes,
      rawShortTextLength: metadata.title?.length ?? 0,
    },
    localityStats?.medianPricePerM2 ?? null
  );
  const score = calculateScore(scoringInput);

  // 8. Uložení
  const upsertData: UpsertInput = {
    source: "sreality",
    sourceUrl: metadata.sourceUrl,
    externalId: metadata.externalId,
    title: metadata.title,
    price: metadata.price,
    pricePerM2: metadata.pricePerM2,
    disposition: metadata.disposition,
    usableArea: metadata.usableArea,
    municipality: metadata.municipality,
    addressText: metadata.addressText,
    gpsLat: metadata.gpsLat ?? null,
    gpsLng: metadata.gpsLng ?? null,
    ownershipType: metadata.ownershipType ?? null,
    condition: metadata.condition ?? null,
    energyLabel: metadata.energyLabel ?? null,
    floor: metadata.floor ?? null,
    totalFloors: metadata.totalFloors ?? null,
    metroWalkMinutes,
    mhdWalkMinutes,
    poiCount500m: null,
    score,
    isPartial: metadata.isPartial,
  };

  const listing = upsertListing(upsertData);

  return {
    listing,
    robotsWarning: !robotsAllowed
      ? "robots.txt portálu omezuje automatický přístup. Ruční import je povolen, ale pro pravidelné stahování dat kontaktujte Sreality pro partnerský feed."
      : null,
  };
}
