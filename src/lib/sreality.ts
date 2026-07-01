// Sreality metadata fetcher
// Nikdy neukládáme fotografie ani celý text — pouze metadata dle spec §2 "Zlaté pravidlo"

const SREALITY_ORIGIN = "https://www.sreality.cz";
const FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface SrealityMetadata {
  externalId: string;
  title: string;
  price: number;
  pricePerM2: number | null;
  disposition: string | null;
  usableArea: number | null;
  municipality: string | null;
  addressText: string | null;
  sourceUrl: string;
  // Rozšířená pole (z API, pokud jsou dostupná)
  gpsLat?: number | null;
  gpsLng?: number | null;
  ownershipType?: "OV" | "DV" | "OTHER" | null;
  condition?: "NEW" | "GOOD" | "AVERAGE" | "BAD" | "RECONSTRUCTION" | null;
  energyLabel?: string | null;
  floor?: number | null;
  totalFloors?: number | null;
  /** true = metadata jsou pouze z URL slug, data je nutné ověřit */
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
    return {
      valid: false,
      error: "URL musí odkazovat na detail inzerátu (/detail/...).",
    };
  }

  if (!extractId(parsed.pathname)) {
    return {
      valid: false,
      error:
        "Nepodařilo se extrahovat ID inzerátu z URL. Zkopírujte celou URL z adresního řádku prohlížeče.",
    };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Parsování URL slug — spolehlivý základ pro každý import
// Formát: /detail/{typ}/{kategorie}/{dispozice}/{lokalita-slug}/{id}
// ---------------------------------------------------------------------------

function extractId(pathname: string): string | null {
  const match = pathname.match(/\/(\d{5,12})\/?(?:[?#].*)?$/);
  return match?.[1] ?? null;
}

function parseUrlSlug(url: string): {
  id: string;
  disposition: string | null;
  municipality: string | null;
  transactionType: string | null;
  propertyType: string | null;
} {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  // parts: ["detail", "prodej", "byt", "2+kk", "brno-brno-mesto-nadrazni", "123456789"]

  const id = extractId(parsed.pathname) ?? "unknown";

  const transactionType = parts[1] ?? null; // prodej / pronajem
  const propertyType = parts[2] ?? null; // byt / dum / pozemek

  // Dispozice — parts[3], dekódujeme %2B → + a - → +
  let disposition: string | null = null;
  if (parts[3] && !/^\d{5,}$/.test(parts[3])) {
    disposition = decodeURIComponent(parts[3]).replace(/-/g, "+");
  }

  // Lokalita — parts[4], před numerickým ID
  let municipality: string | null = null;
  if (parts[4] && !/^\d{5,}$/.test(parts[4])) {
    // "brno-brno-mesto-nadrazni" → "Brno - Brno-město, Nadražní" (best-effort)
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
// Strategie 1: Sreality JSON API (SPA endpoint)
// ---------------------------------------------------------------------------

async function tryApi(id: string): Promise<Partial<SrealityMetadata> | null> {
  const apiUrl = `${SREALITY_ORIGIN}/api/cs/v2/estates/${id}`;

  try {
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": FETCH_UA,
        Accept: "application/json",
        "Accept-Language": "cs-CZ,cs;q=0.9",
        Referer: `${SREALITY_ORIGIN}/`,
      },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    if (!res.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (await res.json()) as any;

    const title: string | undefined = d?.name?.value;
    const price: number | undefined = d?.price_czk?.value ?? d?.price?.value;
    const pricePerM2: number | null = d?.price_czk_unit?.value ?? null;
    const usableArea: number | null =
      d?.usable_area ??
      extractItemNumber(d?.items, ["Užitná plocha", "Plocha"]) ??
      null;
    const municipality: string | null = d?.locality?.value ?? null;

    if (!title && !price) return null;

    // GPS
    const gpsLat: number | null = d?.map?.lat ?? null;
    const gpsLng: number | null = d?.map?.lon ?? null;

    // Vlastnictví
    let ownershipType: SrealityMetadata["ownershipType"] = null;
    const ownershipRaw = extractItemString(d?.items, ["Vlastnictví"]);
    if (ownershipRaw?.includes("osobní")) ownershipType = "OV";
    else if (ownershipRaw?.includes("družstev")) ownershipType = "DV";
    else if (ownershipRaw) ownershipType = "OTHER";

    // Stav
    let condition: SrealityMetadata["condition"] = null;
    const condRaw = extractItemString(d?.items, ["Stav objektu", "Stav"]);
    if (condRaw?.includes("novostavba")) condition = "NEW";
    else if (condRaw?.includes("velmi dobrý")) condition = "GOOD";
    else if (condRaw?.includes("dobrý")) condition = "GOOD";
    else if (condRaw?.includes("průměrný")) condition = "AVERAGE";
    else if (condRaw?.includes("rekonstrukce")) condition = "RECONSTRUCTION";
    else if (condRaw?.includes("špatný")) condition = "BAD";

    // Energetická třída
    const energyLabel = extractItemString(d?.items, ["Energetická náročnost budovy"]);

    // Podlaží
    const floorRaw = extractItemString(d?.items, ["Podlaží"]);
    let floor: number | null = null;
    let totalFloors: number | null = null;
    if (floorRaw) {
      const m = floorRaw.match(/(\d+)\s*(?:z|\/)\s*(\d+)/);
      if (m) { floor = parseInt(m[1], 10); totalFloors = parseInt(m[2], 10); }
      else { const n = floorRaw.match(/(\d+)/); if (n) floor = parseInt(n[1], 10); }
    }

    return {
      title, price: price ?? 0, pricePerM2, usableArea, municipality,
      gpsLat, gpsLng, ownershipType, condition,
      energyLabel: energyLabel?.trim().toUpperCase().slice(0, 1) ?? null,
      floor, totalFloors,
    };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractItemString(items: any, names: string[]): string | null {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    if (names.some((n) => item?.name === n)) {
      return String(item?.value ?? "");
    }
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

// ---------------------------------------------------------------------------
// Strategie 2: Open Graph z HTML stránky
// ---------------------------------------------------------------------------

async function tryHtml(url: string): Promise<Partial<SrealityMetadata> | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": FETCH_UA,
        Accept: "text/html",
        "Accept-Language": "cs-CZ,cs;q=0.9",
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!res.ok) return null;

    const html = await res.text();

    const title =
      extractOgMeta(html, "og:title") ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];

    const desc = extractOgMeta(html, "og:description") ?? "";

    // Cena: "5 000 000 Kč"
    const priceMatch = (desc + " " + title).match(/([\d \s]{3,})\s*K[cč]/i);
    const price = priceMatch
      ? parseInt(priceMatch[1].replace(/[\s ]/g, ""), 10)
      : undefined;

    // Plocha: "50 m²"
    const areaMatch = (title ?? "" + desc).match(/(\d+)\s*m[²2]/);
    const usableArea = areaMatch ? parseInt(areaMatch[1], 10) : null;

    if (!title) return null;
    return { title: title.trim().slice(0, 300), price: price ?? 0, usableArea };
  } catch {
    return null;
  }
}

function extractOgMeta(html: string, property: string): string | null {
  const re = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
  ];
  for (const r of re) {
    const m = html.match(r);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hlavní export
// ---------------------------------------------------------------------------

export async function fetchSrealityMetadata(url: string): Promise<SrealityMetadata> {
  const { id, disposition, municipality, transactionType, propertyType } =
    parseUrlSlug(url);

  if (id === "unknown") throw new Error("Nelze extrahovat ID inzerátu z URL.");

  // Základ ze slug — vždy dostupný, žádný síťový požadavek
  const slugTitle = buildTitleFromSlug(
    transactionType,
    propertyType,
    disposition,
    municipality,
    id
  );

  const base: SrealityMetadata = {
    externalId: id,
    title: slugTitle,
    price: 0,
    pricePerM2: null,
    disposition,
    usableArea: null,
    municipality,
    addressText: municipality,
    sourceUrl: url,
    isPartial: true,
  };

  // Zkusíme obohatit daty — API má přednost, pak HTML
  const enriched = (await tryApi(id)) ?? (await tryHtml(url));

  if (enriched) {
    if (enriched.title) base.title = enriched.title.slice(0, 300);
    if (enriched.price !== undefined) base.price = enriched.price;
    if (enriched.pricePerM2 !== undefined) base.pricePerM2 = enriched.pricePerM2;
    if (enriched.usableArea !== undefined) base.usableArea = enriched.usableArea;
    if (enriched.municipality) base.municipality = enriched.municipality;
    base.isPartial = false;
  }

  return base;
}
