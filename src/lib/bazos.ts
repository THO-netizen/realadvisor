// Bazoš Reality adapter (reality.bazos.cz)
// Jednoduchá PHP stránka s minimální strukturou.
// AI fallback (GPT-4o-mini) jako primární strategie pro nestrukturovaný HTML.
// Nikdy neukládáme fotografie ani celý text — compliance §2.

import type { PortalMetadata } from "./portal-types";
import {
  fetchHtml,
  extractOgMeta,
  extractTitle,
  cleanTitle,
  parsePrice,
  parseArea,
  parseDisposition,
  parseFloor,
  parseOwnership,
  parseCondition,
  parseEnergyLabel,
  extractNumericId,
} from "./portal-utils";
// ---------------------------------------------------------------------------
// Validace
// URL formát: https://reality.bazos.cz/inzerat/{id}/{slug}/
// ---------------------------------------------------------------------------

export function validateBazosUrl(
  url: string
): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: "Neplatná URL adresa." };
  }
  if (!parsed.hostname.endsWith("bazos.cz")) {
    return { valid: false, error: "URL musí být ze stránky reality.bazos.cz." };
  }
  if (parsed.hostname !== "reality.bazos.cz") {
    return {
      valid: false,
      error: "URL musí být ze stránky reality.bazos.cz (ne jiné sekce Bazoš).",
    };
  }
  if (!parsed.pathname.startsWith("/inzerat/")) {
    return {
      valid: false,
      error: "URL musí odkazovat na inzerát (/inzerat/...).",
    };
  }
  if (!extractNumericId(url)) {
    return {
      valid: false,
      error: "Nelze extrahovat ID inzerátu z URL. Zkopírujte celou URL z detailu.",
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Parsování URL slug
// Formát: /inzerat/{id}/{Prodej-bytu-3kk-Praha}/
// ---------------------------------------------------------------------------

// Slova v Bazoš slugu, která nejsou názvy obcí
const BAZOS_SLUG_STOP_WORDS = new Set([
  "prodej", "pronajem", "prenajem", "najem", "bytu", "byty", "domu",
  "domy", "pozemku", "pozemky", "garaze", "komercni", "kancelar",
  "sklep", "sklad", "nebytovy", "nemovitost",
]);

// Nejpoužívanější česká města (seřazena tak, aby delší shody měly přednost)
const KNOWN_CITIES = [
  "Praha 10", "Praha 11", "Praha 12", "Praha 13", "Praha 14", "Praha 15",
  "Praha 1", "Praha 2", "Praha 3", "Praha 4", "Praha 5", "Praha 6",
  "Praha 7", "Praha 8", "Praha 9", "Praha",
  "Brno střed", "Brno sever", "Brno jih", "Brno",
  "Ostrava", "Plzeň", "Liberec", "Olomouc", "Pardubice", "Zlín",
  "Jihlava", "Hradec Králové", "České Budějovice", "Ústí nad Labem",
  "Opava", "Karviná", "Kladno", "Most", "Frýdek-Místek", "Teplice",
];

function parseSlug(url: string): {
  id: string;
  disposition: string | null;
  municipality: string | null;
  transactionType: string | null;
} {
  const id = extractNumericId(url) ?? "unknown";
  const parsed = new URL(url);

  // Poslední segment: "Prodej-bytu-3kk-Praha"
  const slugSegment = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
  // Normalizujeme: "-" → " ", "3kk" → "3+kk"
  const slugDecoded = decodeURIComponent(slugSegment)
    .replace(/[-_]/g, " ")
    .replace(/\b(\d)(kk)\b/gi, "$1+$2"); // "3kk" → "3+kk"

  const transactionType = /pronajem|prenajem|najem/i.test(slugDecoded)
    ? "pronájem"
    : /prodej/i.test(slugDecoded)
    ? "prodej"
    : null;

  const disposition = parseDisposition(slugDecoded);

  // Lokalita — nejdřív zkusíme known city list
  let municipality: string | null = null;
  const slugLower = slugDecoded.toLowerCase();
  for (const city of KNOWN_CITIES) {
    if (slugLower.includes(city.toLowerCase())) {
      municipality = city;
      break;
    }
  }
  // Fallback: velké slovo, které není stop-word
  if (!municipality) {
    const words = slugDecoded.split(/\s+/);
    for (const word of words) {
      if (
        word.length > 3 &&
        /^[A-ZÁÉÍÓÚŮÝČŠŽŘĎŤŇ]/.test(word) &&
        !BAZOS_SLUG_STOP_WORDS.has(word.toLowerCase())
      ) {
        municipality = word;
        break;
      }
    }
  }

  return { id, disposition, municipality, transactionType };
}

// ---------------------------------------------------------------------------
// Strategie 1: HTML CSS třídy (Bazoš specifické selektory)
// ---------------------------------------------------------------------------
// Typická HTML struktura:
//   <h1 class="nadpis">Prodej bytu 3+kk Praha</h1>
//   <span class="important">2 500 000 Kč</span>
//   <div class="popis">Nabízím k prodeji...</div>
//   <table class="infobox">...</table>

function extractFromBazosHtml(
  html: string
): Partial<PortalMetadata> | null {
  // Nadpis
  const h1Match =
    html.match(/<h1[^>]+class="[^"]*nadpis[^"]*"[^>]*>\s*([^<]+)/i) ??
    html.match(/<h1[^>]*>\s*([^<]{5,200})\s*<\/h1>/i);
  const heading = h1Match?.[1]?.trim() ?? null;

  // Cena — nejprve span.important, pak obecné vzory
  const priceMatch =
    html.match(/<span[^>]+class="[^"]*(?:important|cena|price)[^"]*"[^>]*>\s*([^<]+)/i) ??
    html.match(/<strong[^>]*>([^<]*(?:\d[\d\s.,]+\s*K[čc])[^<]*)<\/strong>/i);
  const price = priceMatch
    ? parsePrice(priceMatch[1])
    : parsePrice(html.slice(0, 20_000));

  // Popis — div.popis (omezíme na 800 znaků pro kontextové parsování)
  const descMatch = html.match(
    /<div[^>]+class="[^"]*popis[^"]*"[^>]*>([\s\S]{0,2000}?)<\/div>/i
  );
  const description = descMatch?.[1]
    ? descMatch[1].replace(/<[^>]+>/g, " ").trim().slice(0, 800)
    : "";

  // Tabulka parametrů (infobox)
  const infoboxMatch = html.match(
    /<table[^>]+class="[^"]*(?:infobox|params|detail)[^"]*"[^>]*>([\s\S]{0,3000})<\/table>/i
  );
  const paramText = infoboxMatch
    ? infoboxMatch[1].replace(/<[^>]+>/g, " ")
    : html.slice(0, 15_000);

  const usableArea = parseArea(paramText) ?? parseArea(heading ?? "") ?? parseArea(description);
  const disposition =
    parseDisposition(heading ?? "") ??
    parseDisposition(paramText) ??
    parseDisposition(description);
  const { floor, totalFloors } = parseFloor(paramText);
  const ownership = parseOwnership(paramText + " " + description);
  const condition = parseCondition(description + " " + paramText);
  const energyLabel = parseEnergyLabel(paramText);

  // Lokalita — z <td>Lokalita</td><td>Praha</td>
  const muniMatch =
    html.match(/<td[^>]*>Lokalita<\/td>\s*<td[^>]*>([^<]+)<\/td>/i) ??
    html.match(/Lokalita[:\s]+<[^>]+>([^<]+)</i);
  const municipality = muniMatch?.[1]?.trim() ?? null;

  if (!price && !heading) return null;

  return {
    title: heading ?? undefined,
    price: price ?? 0,
    disposition,
    usableArea,
    municipality,
    ownershipType: ownership,
    condition,
    energyLabel,
    floor,
    totalFloors,
  };
}

// ---------------------------------------------------------------------------
// Strategie 2: OG meta tagy
// ---------------------------------------------------------------------------

function extractFromOgTags(html: string): Partial<PortalMetadata> | null {
  const ogTitle = extractOgMeta(html, "og:title") ?? extractTitle(html);
  if (!ogTitle) return null;

  const cleanedTitle = cleanTitle(ogTitle, "Bazo[šs]", "bazos\\.cz");
  const ogDesc = extractOgMeta(html, "og:description") ?? "";

  const price = parsePrice(ogDesc) ?? parsePrice(html.slice(0, 15_000));
  const disposition = parseDisposition(cleanedTitle) ?? parseDisposition(ogDesc);
  const usableArea = parseArea(cleanedTitle) ?? parseArea(ogDesc);

  const muniCandidates = [
    ogDesc.match(/v\s+([A-ZÁÉÍÓÚŮÝČŠŽŘĎŤŇ][a-záéíóúůýčšžřďťň]+(?:\s+\d+)?)/)?.[1],
    ogDesc.match(/Praha\s*\d*|Brno|Ostrava|Plzeň/)?.[0],
  ];
  const municipality = muniCandidates.find(Boolean) ?? null;

  return {
    title: cleanedTitle || undefined,
    price: price ?? 0,
    disposition,
    usableArea,
    municipality: municipality ?? null,
  };
}

// ---------------------------------------------------------------------------
// Hlavní fetch funkce
// ---------------------------------------------------------------------------

export async function fetchBazosMetadata(url: string): Promise<PortalMetadata> {
  const { id, disposition: slugDisp, municipality: slugMuni, transactionType } =
    parseSlug(url);

  const base: PortalMetadata = {
    externalId: id,
    title: `${transactionType === "pronájem" ? "Pronájem" : "Prodej"} nemovitosti — Bazoš #${id}`,
    price: 0,
    pricePerM2: null,
    disposition: slugDisp,
    usableArea: null,
    municipality: slugMuni,
    addressText: slugMuni,
    sourceUrl: url,
    gpsLat: null,
    gpsLng: null,
    ownershipType: null,
    condition: null,
    energyLabel: null,
    floor: null,
    totalFloors: null,
    isPartial: true,
  };

  const html = await fetchHtml(url);
  if (!html) return base;

  // Strukturované HTML selektory (rychlé, bez API)
  const htmlResult = extractFromBazosHtml(html) ?? extractFromOgTags(html);

  const enriched: Partial<PortalMetadata> = {
    ...htmlResult,
    disposition: htmlResult?.disposition ?? slugDisp,
    municipality: htmlResult?.municipality ?? slugMuni,
    usableArea: htmlResult?.usableArea ?? null,
    price: (htmlResult?.price ?? 0) > 0 ? htmlResult!.price! : 0,
  };

  if (enriched.title) base.title = enriched.title;
  if (enriched.price !== undefined && enriched.price > 0) base.price = enriched.price;
  if (enriched.usableArea) base.usableArea = enriched.usableArea;
  if (enriched.disposition) base.disposition = enriched.disposition;
  if (enriched.municipality) base.municipality = enriched.municipality;
  if (enriched.addressText) base.addressText = enriched.addressText;
  else base.addressText = base.municipality;
  if (enriched.ownershipType) base.ownershipType = enriched.ownershipType;
  if (enriched.condition) base.condition = enriched.condition;
  if (enriched.energyLabel) base.energyLabel = enriched.energyLabel;
  if (enriched.floor) base.floor = enriched.floor;
  if (enriched.totalFloors) base.totalFloors = enriched.totalFloors;

  if (base.price > 0 && base.usableArea && base.usableArea > 0) {
    base.pricePerM2 = Math.round(base.price / base.usableArea);
  }

  base.isPartial = base.price === 0 || !base.usableArea;

  return base;
}
