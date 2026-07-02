// Unified scraping layer — detekce portálu + stažení metadat.
// Bez persistence, bez scoringu, bez Golemio.
// Compliance: robots.txt check (neblokující), rate limit (1 req/2s).

import { validateSrealityUrl, fetchSrealityMetadata } from "./sreality";
import { validateBezrealitkyUrl, fetchBezrealitkyMetadata } from "./bezrealitky";
import { validateIdnesUrl, fetchIdnesMetadata } from "./idnes";
import { validateBazosUrl, fetchBazosMetadata } from "./bazos";
import { isAllowedByRobots } from "./robots-checker";
import { enforceRateLimit } from "./rate-limiter";
import { isBlacklisted } from "./source-blacklist";
import type { PortalMetadata, PortalSource } from "./portal-types";

interface PortalConfig {
  source: PortalSource;
  domain: string;
  validate: (url: string) => { valid: boolean; error?: string };
  fetch: (url: string) => Promise<PortalMetadata>;
  robotsWarning: string;
}

const PORTAL_CONFIGS: PortalConfig[] = [
  {
    source: "sreality",
    domain: "sreality.cz",
    validate: validateSrealityUrl,
    fetch: async (url) => {
      const m = await fetchSrealityMetadata(url);
      return {
        externalId: m.externalId,
        title: m.title,
        price: m.price,
        pricePerM2: m.pricePerM2,
        disposition: m.disposition,
        usableArea: m.usableArea,
        municipality: m.municipality,
        addressText: m.addressText,
        sourceUrl: m.sourceUrl,
        gpsLat: m.gpsLat ?? null,
        gpsLng: m.gpsLng ?? null,
        ownershipType: m.ownershipType ?? null,
        condition: m.condition ?? null,
        energyLabel: m.energyLabel ?? null,
        floor: m.floor ?? null,
        totalFloors: m.totalFloors ?? null,
        isPartial: m.isPartial,
      } satisfies PortalMetadata;
    },
    robotsWarning:
      "Sreality omezuje automatický přístup (robots.txt). Ruční import je povolen.",
  },
  {
    source: "bezrealitky",
    domain: "bezrealitky.cz",
    validate: validateBezrealitkyUrl,
    fetch: fetchBezrealitkyMetadata,
    robotsWarning:
      "Bezrealitky omezuje přístup. Ruční import jednotlivých inzerátů je v pořádku.",
  },
  {
    source: "idnes",
    domain: "reality.idnes.cz",
    validate: validateIdnesUrl,
    fetch: fetchIdnesMetadata,
    robotsWarning:
      "iDNES Reality omezuje přístup. Ruční import je povolen.",
  },
  {
    source: "bazos",
    domain: "reality.bazos.cz",
    validate: validateBazosUrl,
    fetch: fetchBazosMetadata,
    robotsWarning:
      "Bazoš omezuje automatický přístup. Ověřte podmínky portálu.",
  },
];

export interface ScrapedListing {
  metadata: PortalMetadata;
  source: PortalSource;
  robotsWarning: string | null;
}

function detectPortal(url: string): PortalConfig | null {
  try {
    const { hostname } = new URL(url.trim());
    return PORTAL_CONFIGS.find((c) => hostname.endsWith(c.domain)) ?? null;
  } catch {
    return null;
  }
}

export async function scrapeUrl(rawUrl: string): Promise<ScrapedListing> {
  if (isBlacklisted(rawUrl)) {
    throw new Error(
      "Tento portál je na blacklistu — explicitně zakázal automatizovaný přístup."
    );
  }

  const portal = detectPortal(rawUrl);
  if (!portal) {
    throw new Error(
      "Nepodporovaný portál. Podporované zdroje: Sreality, Bezrealitky, iDNES Reality, Bazoš."
    );
  }

  const validation = portal.validate(rawUrl);
  if (!validation.valid) {
    throw new Error(validation.error ?? "Neplatná URL.");
  }

  const robotsAllowed = await isAllowedByRobots(rawUrl);
  await enforceRateLimit(portal.domain);

  console.log(`[scraper] Krok A — ${portal.source}: ${rawUrl}`);
  const metadata = await portal.fetch(rawUrl);

  if (!metadata.price || metadata.price <= 0) {
    throw new Error(
      `Chyba: Inzerát neobsahuje cenu. ` +
      `Zkontrolujte URL nebo zkuste inzerát znovu (možná je smazán).`
    );
  }

  console.log(
    `[scraper] ✓ ${portal.source} OK — ` +
    `${metadata.price.toLocaleString("cs-CZ")} Kč | ` +
    `${metadata.usableArea ?? "?"} m² | ` +
    `"${metadata.municipality ?? "?"}"`
  );

  return {
    metadata,
    source: portal.source,
    robotsWarning: !robotsAllowed ? portal.robotsWarning : null,
  };
}

export function getSupportedPortals(): Array<{ source: PortalSource; domain: string; label: string }> {
  return [
    { source: "sreality",    domain: "sreality.cz",       label: "Sreality" },
    { source: "bezrealitky", domain: "bezrealitky.cz",    label: "Bezrealitky" },
    { source: "idnes",       domain: "reality.idnes.cz",  label: "iDNES Reality" },
    { source: "bazos",       domain: "reality.bazos.cz",  label: "Bazoš Reality" },
  ];
}
