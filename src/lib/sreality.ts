// Sreality metadata fetcher — 4-úrovňový fallback
//
// Pořadí strategií:
//   1) Sreality JSON API s session cookies (/api/cs/v2/estates/{id})
//   2) __NEXT_DATA__ hydration blob (Sreality běží na Next.js)
//   3) JSON-LD structured data
//   4) OG tagy + price regex přes Cheerio
//
// Bypass 403: API call se děje až PO získání session cookies z hlavní stránky.
// Compliance: nikdy neukládáme fotografie ani celý text inzerátu.

import {
  fetchJsonWithSession,
  fetchHtmlWithSession,
  fetchHtml,
  loadCheerio,
  extractJsonLd,
  extractNextData,
  parsePrice,
  parseArea,
} from "./portal-utils";

const SREALITY_ORIGIN = "https://www.sreality.cz";

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

export interface SrealityMetadata {
  externalId: string;
  title: string;
  price: number;
  pricePerM2: number | null;
  disposition: string | null;
  roomCount: number | null;
  usableArea: number | null;
  municipality: string | null;
  addressText: string | null;
  street: string | null;
  houseNumber: string | null;
  sourceUrl: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  ownershipType?: "OV" | "DV" | "OTHER" | null;
  condition?: "NEW" | "GOOD" | "AVERAGE" | "BAD" | "RECONSTRUCTION" | null;
  energyLabel?: string | null;
  floor?: number | null;
  totalFloors?: number | null;
  isPartial: boolean;
}

// ---------------------------------------------------------------------------
// Validace URL
// ---------------------------------------------------------------------------

export function validateSrealityUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: "Neplatná URL adresa." };
  }
  if (!parsed.hostname.endsWith("sreality.cz")) {
    return { valid: false, error: "URL musí být ze stránky sreality.cz." };
  }
  if (!parsed.pathname.startsWith("/detail/")) {
    return { valid: false, error: "URL musí odkazovat na detail inzerátu (/detail/...)." };
  }
  if (!extractId(parsed.pathname)) {
    return {
      valid: false,
      error: "Nepodařilo se extrahovat ID inzerátu z URL. Zkopírujte celou URL z adresního řádku.",
    };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

function extractId(pathname: string): string | null {
  const match = pathname.match(/\/(\d{5,12})\/?(?:[?#].*)?$/);
  return match?.[1] ?? null;
}

function parseUrlSlug(url: string) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const id = extractId(parsed.pathname) ?? "unknown";
  const transactionType = parts[1] ?? null;
  const propertyType = parts[2] ?? null;

  let disposition: string | null = null;
  if (parts[3] && !/^\d{5,}$/.test(parts[3])) {
    disposition = decodeURIComponent(parts[3]).replace(/-/g, "+");
  }

  let municipality: string | null = null;
  if (parts[4] && !/^\d{5,}$/.test(parts[4])) {
    municipality = parts[4]
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return { id, disposition, municipality, transactionType, propertyType };
}

function buildTitleFromSlug(
  transactionType: string | null,
  propertyType: string | null,
  disposition: string | null,
  municipality: string | null,
  id: string
): string {
  const parts: string[] = [];
  if (transactionType === "prodej") parts.push("Prodej");
  else if (transactionType === "pronajem") parts.push("Pronájem");
  if (propertyType === "byt") parts.push("bytu");
  else if (propertyType === "dum") parts.push("domu");
  else if (propertyType === "pozemek") parts.push("pozemku");
  else if (propertyType) parts.push(propertyType);
  if (disposition) parts.push(disposition);
  if (municipality) parts.push(`— ${municipality}`);
  return parts.length > 0 ? parts.join(" ") : `Inzerát Sreality #${id}`;
}

// ---------------------------------------------------------------------------
// Helpers pro JSON API odpověď
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractItemString(items: any, names: string[]): string | null {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (names.some((n) => item?.name === n)) return String(item?.value ?? "");
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractItemNumber(items: any, names: string[]): number | null {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (names.some((n) => item?.name === n)) {
      const match = String(item?.value ?? "").match(/[\d\s]+/);
      if (match) return parseInt(match[0].replace(/\s/g, ""), 10);
    }
  }
  return null;
}

function roomCountFromDisposition(disposition: string | null): number | null {
  if (!disposition) return null;
  const m = disposition.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseLocalityString(raw: string | null): {
  municipality: string | null;
  street: string | null;
  houseNumber: string | null;
} {
  if (!raw) return { municipality: null, street: null, houseNumber: null };

  const commaSplit = raw.split(",").map((s) => s.trim());
  const municipalityPart = commaSplit[0] ?? null;
  const streetPart = commaSplit[1] ?? null;

  let street: string | null = null;
  let houseNumber: string | null = null;
  if (streetPart) {
    const m = streetPart.match(/^(.*?)\s+(\d+(?:\/\d+)?)$/);
    if (m) { street = m[1].trim(); houseNumber = m[2]; }
    else { street = streetPart; }
  }

  const municipality = municipalityPart?.split(" - ")[0]?.trim() ?? null;
  return { municipality, street, houseNumber };
}

// ---------------------------------------------------------------------------
// Strategie 1: Sreality JSON API — session-based bypass 403
//
// Proč session? Sreality kontroluje cookie (PHPSESSID nebo tracking token)
// a bez něj vrací 403 i na /api endpoint. Nejdřív navštívíme hlavní stránku,
// extrahujeme Set-Cookie a pak teprve voláme API.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SrealityApiResponse = any;

async function tryApi(id: string): Promise<Partial<SrealityMetadata> | null> {
  const apiUrl = `${SREALITY_ORIGIN}/api/cs/v2/estates/${id}`;
  console.log(`[sreality][${id}] Strategie 1 — JSON API (session): ${apiUrl}`);

  const d = await fetchJsonWithSession<SrealityApiResponse>(apiUrl, SREALITY_ORIGIN, {
    "X-Requested-With": "XMLHttpRequest",
  });

  if (!d) {
    console.warn(`[sreality][${id}] JSON API: žádná odpověď (403 nebo timeout)`);
    return null;
  }

  // Detekce chybové odpovědi (Sreality vrací {code: 404, message: "..."})
  if (d?.code && d?.message && !d?.name && !d?.price_czk) {
    console.warn(`[sreality][${id}] JSON API chyba: ${d.code} — ${d.message}`);
    return null;
  }

  const title: string | undefined = d?.name?.value;
  const price: number | undefined =
    d?.price_czk?.value ?? d?.price?.value ?? d?.price_czk_formatted?.value;
  const pricePerM2: number | null = d?.price_czk_unit?.value ?? null;
  const usableArea: number | null =
    d?.usable_area ??
    extractItemNumber(d?.items, ["Užitná plocha", "Plocha", "Podlahová plocha"]) ??
    null;

  const localityRaw: string | null = d?.locality?.value ?? null;
  const addressFromItems = extractItemString(d?.items, ["Adresa", "Adresa nemovitosti"]);
  const addressRaw = addressFromItems ?? localityRaw;
  const { municipality, street, houseNumber } = parseLocalityString(addressRaw);

  const dispositionRaw =
    extractItemString(d?.items, ["Dispozice", "Typ bytu", "Typ domu"]) ??
    d?.subtype?.value ?? null;

  const gpsLat: number | null = d?.map?.lat ?? null;
  const gpsLng: number | null = d?.map?.lon ?? null;

  let ownershipType: SrealityMetadata["ownershipType"] = null;
  const ownershipRaw = extractItemString(d?.items, ["Vlastnictví"]);
  if (ownershipRaw?.includes("osobní")) ownershipType = "OV";
  else if (ownershipRaw?.includes("družstev")) ownershipType = "DV";
  else if (ownershipRaw) ownershipType = "OTHER";

  let condition: SrealityMetadata["condition"] = null;
  const condRaw = extractItemString(d?.items, ["Stav objektu", "Stav"]);
  if (condRaw?.includes("novostavba")) condition = "NEW";
  else if (condRaw?.includes("velmi dobrý") || condRaw?.includes("výborný")) condition = "GOOD";
  else if (condRaw?.includes("dobrý")) condition = "GOOD";
  else if (condRaw?.includes("průměrný")) condition = "AVERAGE";
  else if (condRaw?.includes("rekonstrukce")) condition = "RECONSTRUCTION";
  else if (condRaw?.includes("špatný") || condRaw?.includes("zdevastovaný")) condition = "BAD";

  const energyLabel = extractItemString(d?.items, ["Energetická náročnost budovy", "Energetický štítek"]);

  const floorRaw = extractItemString(d?.items, ["Podlaží"]);
  let floor: number | null = null;
  let totalFloors: number | null = null;
  if (floorRaw) {
    const m = floorRaw.match(/(\d+)\s*(?:z|\/)\s*(\d+)/);
    if (m) { floor = parseInt(m[1], 10); totalFloors = parseInt(m[2], 10); }
    else { const n = floorRaw.match(/(\d+)/); if (n) floor = parseInt(n[1], 10); }
  }

  if (!title && !price) {
    console.warn(`[sreality][${id}] JSON API: prázdná odpověď`);
    return null;
  }

  console.log(
    `[sreality][${id}] ✓ JSON API OK — cena=${price ?? 0} Kč | ` +
    `plocha=${usableArea ?? "N/A"} m² | obec="${municipality ?? "N/A"}" | GPS=${gpsLat != null ? `${gpsLat},${gpsLng}` : "N/A"}`
  );

  return {
    title, price: price ?? 0, pricePerM2, usableArea,
    disposition: dispositionRaw, roomCount: roomCountFromDisposition(dispositionRaw),
    municipality, addressText: addressRaw, street, houseNumber,
    gpsLat, gpsLng, ownershipType, condition,
    energyLabel: energyLabel?.trim().toUpperCase().slice(0, 1) ?? null,
    floor, totalFloors,
  };
}

// ---------------------------------------------------------------------------
// Strategie 2: __NEXT_DATA__ blob — komplexní extrakce
// ---------------------------------------------------------------------------

function tryNextData(html: string, id: string): Partial<SrealityMetadata> | null {
  const raw = extractNextData(html);
  if (!raw) return null;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pp = (raw as any)?.props?.pageProps ?? {};

  // Primární: estate objekt přesně v pageProps (Sreality SSR)
  const estate =
    pp?.estate ??
    pp?.data?.estate ??
    pp?.initialData?.estate ??
    null;

  if (estate) {
    const title = estate?.name?.value ?? estate?.title ?? null;
    const price =
      estate?.price_czk?.value ??
      estate?.price?.value ??
      estate?.price ?? 0;
    const usableArea =
      estate?.usable_area ??
      extractItemNumber(estate?.items, ["Užitná plocha", "Plocha"]) ??
      null;
    const localityRaw = estate?.locality?.value ?? null;
    const { municipality, street, houseNumber } = parseLocalityString(localityRaw);
    const dispositionRaw =
      extractItemString(estate?.items, ["Dispozice", "Typ bytu", "Typ domu"]) ??
      estate?.subtype?.value ?? null;
    const gpsLat = estate?.map?.lat ?? null;
    const gpsLng = estate?.map?.lon ?? null;

    if (title || price) {
      console.log(`[sreality][${id}] ✓ __NEXT_DATA__ estate OK`);
      return {
        title: title ? String(title).slice(0, 300) : undefined,
        price: typeof price === "number" ? price : 0,
        usableArea,
        municipality,
        addressText: localityRaw,
        street,
        houseNumber,
        disposition: dispositionRaw,
        roomCount: roomCountFromDisposition(dispositionRaw),
        gpsLat: typeof gpsLat === "number" ? gpsLat : null,
        gpsLng: typeof gpsLng === "number" ? gpsLng : null,
      };
    }
  }

  // Fallback: hledáme libovolný klíč v pageProps s cenou nebo title
  const anyPage = Object.values(pp ?? {});
  for (const obj of anyPage) {
    if (typeof obj !== "object" || !obj) continue;
    const o = obj as any;
    const price = o?.price_czk?.value ?? o?.price?.value ?? o?.price;
    const title = o?.name?.value ?? o?.name ?? o?.title;
    if ((price && typeof price === "number" && price > 10_000) || title) {
      console.log(`[sreality][${id}] ✓ __NEXT_DATA__ pageProps fallback`);
      return {
        title: title ? String(title).slice(0, 300) : undefined,
        price: typeof price === "number" ? price : 0,
        usableArea: o?.usable_area ?? null,
      };
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return null;
}

// ---------------------------------------------------------------------------
// Strategie 3: JSON-LD
// ---------------------------------------------------------------------------

function tryJsonLd(html: string, id: string): Partial<SrealityMetadata> | null {
  const ld = extractJsonLd(html);
  if (!ld?.name) return null;

  const offerPrice = (ld.offers as Record<string, unknown>)?.price;
  const ldPrice = typeof offerPrice === "number" ? offerPrice
    : typeof offerPrice === "string" ? parseFloat(offerPrice) : 0;
  const floorSizeRaw = (ld.floorSize as Record<string, unknown>)?.value;
  const ldArea = typeof floorSizeRaw === "number" ? floorSizeRaw : null;

  console.log(`[sreality][${id}] ✓ JSON-LD OK`);
  return { title: String(ld.name), price: ldPrice, usableArea: ldArea };
}

// ---------------------------------------------------------------------------
// Strategie 4: Cheerio OG tagy + price regex — nejnouzovější
// ---------------------------------------------------------------------------

function tryCheerio(html: string, id: string): Partial<SrealityMetadata> | null {
  const $ = loadCheerio(html);

  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
  const ogDesc = $('meta[property="og:description"]').attr("content")?.trim() ?? "";
  const title = ogTitle ?? ($("title").text().trim() || null);

  // Cena — více vzorů s ohledem na různé formátování
  const priceSource = ogDesc + " " + html.slice(0, 60_000);
  let price = parsePrice(priceSource);

  // Regex fallback: hledáme číslo před Kč/CZK s mezerami jako oddělovači tisíců
  if (!price) {
    const m = priceSource.match(/(\d[\d  ]{2,})\s*(?:K[cč]|CZK)/i);
    if (m) price = parseInt(m[1].replace(/[ \s]/g, ""), 10) || null;
  }

  // Hledáme JSON fragment s price přímo v HTML (vložené skripty)
  if (!price) {
    const jsonPriceMatch = html.match(/"price(?:Czk)?"\s*:\s*(\d{4,})/i);
    if (jsonPriceMatch) price = parseInt(jsonPriceMatch[1], 10);
  }

  const usableArea =
    parseArea(ogDesc + " " + (title ?? "")) ??
    (() => {
      const m = html.slice(0, 40_000).match(/"usableArea"\s*:\s*(\d+(?:\.\d+)?)/i);
      return m ? parseFloat(m[1]) : null;
    })();

  if (!title) {
    console.error(`[sreality][${id}] Cheerio: žádný titulek`);
    return null;
  }

  console.log(`[sreality][${id}] ✓ Cheerio — cena=${price ?? 0} Kč | plocha=${usableArea ?? "N/A"} m²`);
  return { title: title.slice(0, 300), price: price ?? 0, usableArea };
}

// ---------------------------------------------------------------------------
// Hlavní export
// ---------------------------------------------------------------------------

export async function fetchSrealityMetadata(url: string): Promise<SrealityMetadata> {
  const { id, disposition, municipality, transactionType, propertyType } = parseUrlSlug(url);
  if (id === "unknown") throw new Error("Nelze extrahovat ID inzerátu z URL.");

  console.log(`\n[sreality] ══ Začíná import inzerátu ${id} ══`);

  const base: SrealityMetadata = {
    externalId: id,
    title: buildTitleFromSlug(transactionType, propertyType, disposition, municipality, id),
    price: 0,
    pricePerM2: null,
    disposition,
    roomCount: roomCountFromDisposition(disposition),
    usableArea: null,
    municipality,
    addressText: municipality,
    street: null,
    houseNumber: null,
    sourceUrl: url,
    isPartial: true,
  };

  // ── Strategie 1: JSON API s session cookies ───────────────────────────────
  let enriched: Partial<SrealityMetadata> | null = await tryApi(id);

  // ── Strategie 2–4: HTML-based (session fetch) ─────────────────────────────
  if (!enriched) {
    console.log(`[sreality][${id}] API selhal, zkouším HTML strategie…`);

    const html =
      (await fetchHtmlWithSession(url, SREALITY_ORIGIN, 16_000)) ??
      (await fetchHtml(url, 14_000));

    if (html) {
      enriched =
        tryNextData(html, id) ??
        tryJsonLd(html, id) ??
        tryCheerio(html, id);
    }
  }

  // ── Strategie 5: Browser bypass (ScraperAPI nebo Puppeteer Stealth) ───────
  if (!enriched) {
    console.log(`[sreality][${id}] Strategie 5 — Browser bypass (ScraperAPI/Puppeteer)…`);
    try {
      const { browserFetchHtml } = await import("./browser-fetch");
      const browserHtml = await browserFetchHtml(url);
      enriched =
        tryNextData(browserHtml, id) ??
        tryJsonLd(browserHtml, id) ??
        tryCheerio(browserHtml, id);
      if (enriched) {
        console.log(`[sreality][${id}] ✓ Browser bypass — data úspěšně extrahována`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Přepíšeme na uživatelsky srozumitelnou zprávu
      throw new Error(
        msg.includes("firewall") ? msg : "Detekován firewall Srealit, data nelze stáhnout."
      );
    }
  }

  if (!enriched) {
    throw new Error("Detekován firewall Srealit, data nelze stáhnout.");
  }

  // ── Merge enriched → base ─────────────────────────────────────────────────
  if (enriched.title) base.title = enriched.title.slice(0, 300);
  if (enriched.price !== undefined && enriched.price > 0) base.price = enriched.price;
  if (enriched.pricePerM2 !== undefined) base.pricePerM2 = enriched.pricePerM2;
  if (enriched.usableArea != null) base.usableArea = enriched.usableArea;
  if (enriched.municipality) base.municipality = enriched.municipality;
  if (enriched.addressText) base.addressText = enriched.addressText;
  if (enriched.street) base.street = enriched.street;
  if (enriched.houseNumber) base.houseNumber = enriched.houseNumber;
  if (enriched.disposition) base.disposition = enriched.disposition;
  if (enriched.roomCount != null) base.roomCount = enriched.roomCount;
  if (enriched.gpsLat != null) base.gpsLat = enriched.gpsLat;
  if (enriched.gpsLng != null) base.gpsLng = enriched.gpsLng;
  if (enriched.ownershipType !== undefined) base.ownershipType = enriched.ownershipType;
  if (enriched.condition !== undefined) base.condition = enriched.condition;
  if (enriched.energyLabel !== undefined) base.energyLabel = enriched.energyLabel;
  if (enriched.floor !== undefined) base.floor = enriched.floor;
  if (enriched.totalFloors !== undefined) base.totalFloors = enriched.totalFloors;
  base.isPartial = false;

  if (!base.price && !base.usableArea) {
    throw new Error(
      `Sreality inzerát ${id}: prázdná data (cena=0, plocha=null). ` +
      `Inzerát byl pravděpodobně smazán nebo je za přihlášením.`
    );
  }

  base.pricePerM2 =
    base.pricePerM2 ??
    (base.price && base.usableArea ? Math.round(base.price / base.usableArea) : null);

  console.log(
    `[sreality][${id}] ══ DOKONČEN ══ ` +
    `${base.price.toLocaleString("cs-CZ")} Kč | ${base.usableArea ?? "?"} m² | ` +
    `${base.pricePerM2?.toLocaleString("cs-CZ") ?? "?"} Kč/m² | ${base.disposition ?? "?"} | ` +
    `"${base.municipality ?? "?"}" | GPS=${base.gpsLat != null ? `${base.gpsLat},${base.gpsLng}` : "N/A"}\n`
  );

  return base;
}
