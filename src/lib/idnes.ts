// Reality iDNES adapter (reality.idnes.cz)
// Klasická serverem renderovaná stránka — čteme HTML selektory + OG tagy.
// Nikdy neukládáme fotografie ani celý text — compliance §2.

import type { PortalMetadata } from "./portal-types";
import {
  fetchHtml,
  extractOgMeta,
  extractJsonLd,
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
// URL formát: https://reality.idnes.cz/detail/{typ}/{dispozice}/{lokalita}/{id}/
// ---------------------------------------------------------------------------

export function validateIdnesUrl(
  url: string
): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: "Neplatná URL adresa." };
  }
  if (
    !parsed.hostname.endsWith("idnes.cz") &&
    !parsed.hostname.endsWith("reality.idnes.cz")
  ) {
    return {
      valid: false,
      error: "URL musí být ze stránky reality.idnes.cz.",
    };
  }
  if (parsed.hostname !== "reality.idnes.cz") {
    return {
      valid: false,
      error: "URL musí být ze stránky reality.idnes.cz (ne jiné sekce iDNES).",
    };
  }
  if (!parsed.pathname.startsWith("/detail/")) {
    return {
      valid: false,
      error: "URL musí odkazovat na detail inzerátu (/detail/...).",
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
// Formát: /detail/prodej-bytu/3-plus-1/plzen-jizni-predmesti-rooseveltova/{id}/
// ---------------------------------------------------------------------------

function parseSlug(url: string): {
  id: string;
  disposition: string | null;
  municipality: string | null;
  transactionType: string | null;
  propertyType: string | null;
} {
  const id = extractNumericId(url) ?? "unknown";
  const parsed = new URL(url);
  const segments = parsed.pathname.replace(/^\/detail\//, "").split("/").filter(Boolean);

  // segments[0]: "prodej-bytu" | "pronajem-bytu" | "prodej-domu" ...
  const typeSlug = segments[0] ?? "";
  const transactionType = /pronajem|prenajom/i.test(typeSlug)
    ? "pronájem"
    : /prodej/i.test(typeSlug)
    ? "prodej"
    : null;
  const propertyType = /bytu|byty/i.test(typeSlug)
    ? "byt"
    : /domu|domy/i.test(typeSlug)
    ? "dům"
    : /pozemku|pozemky/i.test(typeSlug)
    ? "pozemek"
    : null;

  // segments[1]: "3-plus-1" | "3-plus-kk" | ...
  const dispSlug = segments[1] ?? "";
  const dispNorm = dispSlug.replace(/-plus-/i, "+").replace(/-/g, "");
  const disposition = parseDisposition(dispNorm) ?? parseDisposition(dispSlug.replace(/-/g, " "));

  // segments[2]: "plzen-jizni-predmesti-rooseveltova" — první slova jsou obec
  const locationSlug = segments.find((s) => s.length > 3 && !/^\d+/.test(s) && s !== dispSlug && s !== typeSlug) ?? "";
  let municipality: string | null = null;
  if (locationSlug) {
    // Vezmi první 2-3 slova jako obec
    const words = locationSlug.split("-").slice(0, 3);
    municipality = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  return { id, disposition, municipality, transactionType, propertyType };
}

// ---------------------------------------------------------------------------
// Strategie 1: JSON-LD
// ---------------------------------------------------------------------------

function extractFromJsonLd(html: string): Partial<PortalMetadata> | null {
  const ld = extractJsonLd(html);
  if (!ld) return null;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const price =
    typeof ld.price === "number"
      ? ld.price
      : parsePrice(String((ld as any)?.offers?.price ?? ld.price ?? ""));
  const title = String(ld.name ?? "").trim().slice(0, 300) || null;
  const description = String(ld.description ?? "");
  const area = parseArea(String((ld as any)?.floorSize?.value ?? "")) ?? parseArea(description);
  const address = (ld as any)?.address;
  const municipality = String(address?.addressLocality ?? "").trim() || null;
  const addressText =
    [address?.streetAddress, address?.addressLocality]
      .filter(Boolean)
      .join(", ") || null;
  const geo = (ld as any)?.geo;
  const gpsLat = typeof geo?.latitude === "number" ? geo.latitude : null;
  const gpsLng = typeof geo?.longitude === "number" ? geo.longitude : null;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (!price && !title) return null;

  return {
    title: title ?? undefined,
    price: price ?? 0,
    disposition: parseDisposition(title ?? "") ?? parseDisposition(description),
    usableArea: area,
    municipality,
    addressText,
    gpsLat,
    gpsLng,
    ownershipType: parseOwnership(description),
    condition: parseCondition(description),
    energyLabel: parseEnergyLabel(description),
  };
}

// ---------------------------------------------------------------------------
// Strategie 2: HTML selektory (regex na CSS třídy iDNES)
// ---------------------------------------------------------------------------
// iDNES používá konzistentní HTML strukturu. Klíčové elementy:
//   .b-detail__price, .b-detail__heading, .b-detail__item, .b-paging

function extractFromHtmlSelectors(html: string): Partial<PortalMetadata> | null {
  // Cena — různé CSS třídy napříč verzemi webu
  const pricePatterns = [
    /<(?:span|div|p)[^>]+class="[^"]*(?:b-detail__price|price|cena)[^"]*"[^>]*>([^<]+)</i,
    /<strong[^>]*class="[^"]*price[^"]*"[^>]*>([^<]+)</i,
    /Cena[:\s]*<[^>]+>([^<]+)/i,
    /(\d[\d\s.,]+)\s*(?:K[čc]|CZK)/i,
  ];

  let priceText = "";
  for (const re of pricePatterns) {
    const m = html.match(re);
    if (m?.[1]) { priceText = m[1]; break; }
  }
  const price = parsePrice(priceText) ?? parsePrice(html.slice(0, 30_000));

  // Nadpis — h1
  const headingMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const heading = headingMatch?.[1]?.trim().slice(0, 300) ?? null;

  // Plocha — text u m²
  const areaMatch = html.match(/(?:Plocha|plocha\s+bytu)[:\s]*(\d+)\s*m[²2]/i);
  const usableArea = areaMatch
    ? parseInt(areaMatch[1], 10)
    : parseArea(html.slice(0, 30_000));

  // Lokalita — breadcrumb nebo adresa
  const addressMatch = html.match(
    /(?:Adresa|Lokalita|Obec)[:\s]*<[^>]+>([^<]+)</i
  );
  const municipality = addressMatch?.[1]?.trim().slice(0, 100) ?? null;

  // Vlastnictví, stav, podlaží z tabulky parametrů
  const paramBlock = html.match(
    /<(?:table|ul|dl)[^>]+class="[^"]*(?:b-detail|params|detail)[^"]*"[^>]*>([\s\S]{0,5000})<\/(?:table|ul|dl)>/i
  )?.[1] ?? html.slice(0, 30_000);

  const ownership = parseOwnership(paramBlock);
  const condition = parseCondition(paramBlock);
  const { floor, totalFloors } = parseFloor(paramBlock);
  const energyLabel = parseEnergyLabel(paramBlock);

  const disposition = parseDisposition(heading ?? "") ?? parseDisposition(paramBlock);

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
// Strategie 3: OG meta tagy
// Typické formáty:
//   "3+1, 55 m², Plzeň 3 - prodej bytu - Reality iDNES.cz"
//   "Praha 4, byt 3+kk, 80 m², Novodvorská - Reality iDNES.cz"
// ---------------------------------------------------------------------------

function extractFromOgTags(html: string): Partial<PortalMetadata> | null {
  const ogTitle =
    extractOgMeta(html, "og:title") ?? extractTitle(html);
  if (!ogTitle) return null;

  const cleanedTitle = cleanTitle(ogTitle, "Reality iDNES\\.cz", "iDNES\\.cz", "reality\\.idnes");
  const ogDesc = extractOgMeta(html, "og:description") ?? "";

  const disposition = parseDisposition(cleanedTitle) ?? parseDisposition(ogDesc);
  const usableArea = parseArea(cleanedTitle) ?? parseArea(ogDesc);
  const price = parsePrice(ogDesc) ?? parsePrice(html.slice(0, 20_000));

  // Lokalita: první nebo druhý token (Praha 4, Plzeň 3, ...)
  let municipality: string | null = null;
  const muniCandidates = [
    cleanedTitle.match(/^([^,]+),/)?.[1]?.trim(),
    cleanedTitle.match(/,\s*([^,\-]+(?:\s+\d)?)\s*[-–]/)?.[1]?.trim(),
    cleanedTitle.match(/,\s*([A-ZÁÉÍÓÚŮÝČŠŽŘĎŤŇ][^,]+)$/)?.[1]?.trim(),
  ];
  for (const c of muniCandidates) {
    if (c && c.length > 2 && c.length < 60) { municipality = c; break; }
  }

  return {
    title: cleanedTitle,
    price: price ?? 0,
    disposition,
    usableArea,
    municipality,
    ownershipType: parseOwnership(ogDesc),
    condition: parseCondition(ogDesc),
  };
}

// ---------------------------------------------------------------------------
// Hlavní fetch funkce
// ---------------------------------------------------------------------------

export async function fetchIdnesMetadata(
  url: string
): Promise<PortalMetadata> {
  const { id, disposition: slugDisp, municipality: slugMuni, transactionType, propertyType } =
    parseSlug(url);

  const typeLabel = [
    transactionType === "pronájem" ? "Pronájem" : "Prodej",
    propertyType,
    slugDisp,
  ]
    .filter(Boolean)
    .join(" ");

  const base: PortalMetadata = {
    externalId: id,
    title: `${typeLabel || "Nemovitost"} — iDNES Reality #${id}`,
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

  const enriched =
    extractFromJsonLd(html) ??
    extractFromHtmlSelectors(html) ??
    extractFromOgTags(html);

  if (!enriched) return base;

  if (enriched.title) base.title = enriched.title;
  if (enriched.price !== undefined && enriched.price > 0) base.price = enriched.price;
  if (enriched.usableArea) base.usableArea = enriched.usableArea;
  if (enriched.disposition) base.disposition = enriched.disposition;
  else if (slugDisp) base.disposition = slugDisp;
  if (enriched.municipality) base.municipality = enriched.municipality;
  else if (slugMuni) base.municipality = slugMuni;
  if (enriched.addressText) base.addressText = enriched.addressText;
  else base.addressText = base.municipality;
  if (enriched.gpsLat) base.gpsLat = enriched.gpsLat;
  if (enriched.gpsLng) base.gpsLng = enriched.gpsLng;
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
