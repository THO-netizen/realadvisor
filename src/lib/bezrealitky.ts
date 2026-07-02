// Bezrealitky.cz adapter
//
// Pořadí strategií:
//   1) __NEXT_DATA__ blob — Apollo cache + různé schéma verze Next.js
//   2) JSON-LD structured data
//   3) OG tagy + deep-regex z raw HTML (price, area)
//
// Bezrealitky blokuje CSS-selektor přístup — veškerá data jsou v __NEXT_DATA__
// (hydration blob Next.js + Apollo GraphQL state).
// Compliance: nikdy neukládáme fotografie ani celý text inzerátu.

import type { PortalMetadata } from "./portal-types";
import {
  fetchHtmlWithSession,
  fetchHtml,
  extractOgMeta,
  extractJsonLd,
  extractNextData,
  extractTitle,
  cleanTitle,
  loadCheerio,
  parsePrice,
  parseArea,
  parseDisposition,
  parseFloor,
  parseOwnership,
  parseCondition,
  parseEnergyLabel,
  extractNumericId,
} from "./portal-utils";

const BZR_ORIGIN = "https://www.bezrealitky.cz";

// ---------------------------------------------------------------------------
// Validace
// ---------------------------------------------------------------------------

export function validateBezrealitkyUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: "Neplatná URL adresa." };
  }
  if (!parsed.hostname.endsWith("bezrealitky.cz")) {
    return { valid: false, error: "URL musí být ze stránky bezrealitky.cz." };
  }
  if (!parsed.pathname.match(/\/(nemovitosti|detail|inzerat|byty|domy|pozemky|komercni)/i)) {
    return {
      valid: false,
      error: "URL musí odkazovat na konkrétní inzerát (stránka detail nemovitosti).",
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
// URL slug parsing
// ---------------------------------------------------------------------------

function parseSlug(url: string): {
  id: string;
  disposition: string | null;
  municipality: string | null;
  transactionType: string | null;
} {
  const id = extractNumericId(url) ?? "unknown";
  const parsed = new URL(url);
  const slug = parsed.pathname.replace(/\//g, " ");

  let transactionType: string | null = null;
  if (/prodej|prodat/i.test(slug)) transactionType = "prodej";
  else if (/pronajem|pronajmout|najem/i.test(slug)) transactionType = "pronájem";

  const disposition = parseDisposition(decodeURIComponent(slug).replace(/-/g, " "));

  const segments = parsed.pathname.split("/").filter(Boolean);
  let municipality: string | null = null;
  for (const seg of segments) {
    if (/^\d{5,}/.test(seg)) continue;
    if (seg.length > 4 && !/^(nemovitosti|byty|domy|pozemky|komercni)/i.test(seg)) {
      const words = seg
        .replace(/\d+/g, "")
        .split("-")
        .filter((w) => w.length > 1 && !/^(byt|byta|dum|domu|prodej|pronajem|kk)$/i.test(w));
      if (words.length > 0) {
        municipality = words
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
          .trim();
      }
    }
  }

  return { id, disposition, municipality, transactionType };
}

// ---------------------------------------------------------------------------
// Strategie 1: __NEXT_DATA__ (Next.js hydration + Apollo GraphQL cache)
//
// Bezrealitky používá Apollo cache — klíče mají formáty:
//   "Advert:12345"
//   "Advert:{\"id\":\"12345\"}"
//   nebo jsou vnořeny v ROOT_QUERY
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractAdvertFromApollo(apolloState: Record<string, any>): any | null {
  for (const key of Object.keys(apolloState)) {
    if (!key.startsWith("Advert:")) continue;
    const obj = apolloState[key];
    // Musí mít alespoň price nebo name
    if (obj?.price || obj?.name || obj?.priceNote) return obj;
  }

  // Fallback: hledáme libovolný klíč s číselnou cenou > 10k
  for (const obj of Object.values(apolloState)) {
    if (typeof obj !== "object" || !obj) continue;
    const price = (obj as Record<string, unknown>).price;
    if (typeof price === "number" && price > 10_000) return obj;
  }

  return null;
}

function extractFromNextData(html: string): Partial<PortalMetadata> | null {
  const raw = extractNextData(html);
  if (!raw) return null;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pageProps = (raw as any)?.props?.pageProps ?? {};

  // ── Cesta A: přímý advert objekt ──────────────────────────────────────────
  const advertDirect =
    pageProps?.advert ??
    pageProps?.initialData?.advert ??
    pageProps?.data?.advert ??
    pageProps?.initialProps?.advert ??
    null;

  // ── Cesta B: Apollo GraphQL cache ─────────────────────────────────────────
  const apolloState: Record<string, any> =
    pageProps?.apolloState ??
    pageProps?.["__APOLLO_STATE__"] ??
    (raw as any)?.["__APOLLO_STATE__"] ??
    {};

  const advertApollo = extractAdvertFromApollo(apolloState);

  const advert = advertDirect ?? advertApollo;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (!advert) return null;

  // ── Extrakce ceny ──────────────────────────────────────────────────────────
  let price: number | null = null;
  if (typeof advert.price === "number" && advert.price > 0) {
    price = advert.price;
  } else if (typeof advert.price === "object" && advert.price?.value) {
    price = advert.price.value;
  } else if (typeof advert.totalPrice === "number") {
    price = advert.totalPrice;
  } else {
    price = parsePrice(String(advert.priceNote ?? advert.name ?? ""));
  }

  // ── Titulek ────────────────────────────────────────────────────────────────
  const title =
    String(advert.name ?? advert.title ?? advert.heading ?? "").trim().slice(0, 300) || null;

  // ── Plocha ─────────────────────────────────────────────────────────────────
  const area: number | null =
    typeof advert.usableArea === "number" ? advert.usableArea :
    typeof advert.surface === "number" ? advert.surface :
    typeof advert.floorArea === "number" ? advert.floorArea :
    parseArea(String(advert.description ?? advert.name ?? ""));

  // ── Dispozice ──────────────────────────────────────────────────────────────
  const dispRaw =
    advert.disposition ??
    advert.subType ??
    advert.category?.name ??
    advert.type?.name ?? "";
  const disposition =
    parseDisposition(String(dispRaw)) ??
    parseDisposition(title ?? "");

  // ── Lokalita ───────────────────────────────────────────────────────────────
  const muniRaw =
    advert.location?.city ??
    advert.location?.quarter ??
    advert.address?.city ??
    advert.city ??
    advert.municipality ?? "";
  const municipality = String(muniRaw).trim() || null;
  const addressText =
    String(advert.address?.full ?? advert.location?.full ?? advert.fullAddress ?? "").trim() || null;

  // ── GPS ────────────────────────────────────────────────────────────────────
  const gpsLat: number | null =
    advert.gps?.lat ?? advert.location?.gps?.lat ?? advert.latitude ?? null;
  const gpsLng: number | null =
    advert.gps?.lng ?? advert.gps?.lon ?? advert.location?.gps?.lon ?? advert.longitude ?? null;

  if (!price && !title) return null;

  return {
    title: title ?? undefined,
    price: price ?? 0,
    disposition,
    usableArea: area ?? null,
    municipality,
    addressText,
    gpsLat: typeof gpsLat === "number" ? gpsLat : null,
    gpsLng: typeof gpsLng === "number" ? gpsLng : null,
  };
}

// ---------------------------------------------------------------------------
// Strategie 2: JSON-LD
// ---------------------------------------------------------------------------

function extractFromJsonLd(html: string): Partial<PortalMetadata> | null {
  const ld = extractJsonLd(html);
  if (!ld) return null;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const price =
    typeof ld.price === "number" ? ld.price :
    parsePrice(String((ld as any)?.offers?.price ?? ld.price ?? ""));

  const title = String(ld.name ?? "").trim().slice(0, 300) || null;
  const description = String(ld.description ?? "");
  const area =
    parseArea(description) ??
    parseArea(String((ld as any)?.floorSize?.value ?? ""));

  const address = (ld as any)?.address;
  const municipality =
    String(address?.addressLocality ?? address?.addressRegion ?? "").trim() || null;
  const addressText =
    [address?.streetAddress, address?.addressLocality].filter(Boolean).join(", ") || null;

  const geo = (ld as any)?.geo;
  const gpsLat = typeof geo?.latitude === "number" ? geo.latitude : null;
  const gpsLng = typeof geo?.longitude === "number" ? geo.longitude : null;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const disposition =
    parseDisposition(title ?? "") ?? parseDisposition(description);

  if (!price && !title) return null;

  return { title: title ?? undefined, price: price ?? 0, disposition, usableArea: area, municipality, addressText, gpsLat, gpsLng };
}

// ---------------------------------------------------------------------------
// Strategie 3: OG tagy + deep-regex z raw HTML
//
// Bezrealitky vkládá data do inline <script> bloků jako JSON.
// Hledáme číselné vzory pro cenu a plochu napříč celým dokumentem.
// ---------------------------------------------------------------------------

function extractFromOgAndRegex(html: string): Partial<PortalMetadata> | null {
  const ogTitle = extractOgMeta(html, "og:title") ?? extractTitle(html);
  if (!ogTitle) return null;

  const cleanedTitle = cleanTitle(ogTitle, "Bezrealitky\\.cz", "bezrealitky");
  const ogDesc = extractOgMeta(html, "og:description") ?? "";

  const disposition = parseDisposition(cleanedTitle) ?? parseDisposition(ogDesc);
  const usableArea = parseArea(cleanedTitle) ?? parseArea(ogDesc);

  // ── Cena: OG → JSON klíče v HTML → text regex ────────────────────────────
  let price: number | null = parsePrice(ogDesc);

  if (!price) {
    // JSON klíče: "price":3500000, "totalPrice":3500000, "amount":3500000
    const jsonKeys = [
      /"(?:price|totalPrice|amount|priceValue|advertisingPrice)"\s*:\s*(\d{5,})/gi,
      /"price(?:Note|Czk)?"\s*:\s*"([^"]+)"/gi,
    ];
    for (const re of jsonKeys) {
      const m = re.exec(html);
      if (m) {
        const n = parseInt(m[1].replace(/\s/g, ""), 10);
        if (!isNaN(n) && n > 50_000) { price = n; break; }
      }
    }
  }

  if (!price) {
    // Poslední záchrana: číslo před Kč s mezerami jako oddělovači tisíců
    const m = html.slice(0, 80_000).match(/([\d][\d ]{3,})\s*(?:K[cč]|CZK)/i);
    if (m) price = parseInt(m[1].replace(/\s/g, ""), 10) || null;
  }

  // ── Plocha: OG → JSON → text ──────────────────────────────────────────────
  let area: number | null = usableArea;
  if (!area) {
    const areaJson = html.match(/"(?:usableArea|surface|floorArea|area)"\s*:\s*(\d+(?:\.\d+)?)/i);
    if (areaJson) area = parseFloat(areaJson[1]) || null;
  }

  const muniMatch = cleanedTitle.match(/m[²2][,\s]+(.+?)(?:\s*[-–—]\s*.+)?$/i);
  const municipality = muniMatch
    ? muniMatch[1].trim().replace(/\s*[-–]\s*.+$/, "").trim()
    : null;

  return {
    title: cleanedTitle,
    price: price ?? 0,
    disposition,
    usableArea: area,
    municipality,
    ownershipType: parseOwnership(ogDesc),
    condition: parseCondition(ogDesc),
    energyLabel: parseEnergyLabel(ogDesc),
    floor: parseFloor(ogDesc).floor,
    totalFloors: parseFloor(ogDesc).totalFloors,
  };
}

// ---------------------------------------------------------------------------
// Strategie 4: Visual DOM — Cheerio z viditelných HTML elementů
//
// Bezrealitky renderuje plochu a dispozici přímo do H1 (formát:
// "Prodej bytu 4+kk • 76 m² bez realitky") a adresu do elementu
// hned pod ním. Tato vrstva je spolehlivý záchranný net pro případ,
// kdy Apollo cache / JSON-LD chybí nebo vrátí neúplná data.
// Spouštíme vždy a výsledky používáme k doplnění mezer.
// ---------------------------------------------------------------------------

const CZECH_CITIES =
  /Praha|Brno|Ostrava|Plzeň|Liberec|Olomouc|Hradec Králové|Pardubice|Zlín|Kladno|Ústí nad Labem|Jihlava|Opava|Teplice|Karviná|Most|Frýdek-Místek|České Budějovice|Havířov|Přerov|Chomutov|Jablonec|Znojmo|Prostějov|Třebíč/i;

function extractFromVisualDom(html: string): Partial<PortalMetadata> | null {
  const $ = loadCheerio(html);

  // ── H1 + <title>: plocha a dispozice ──────────────────────────────────────
  const h1Text  = $("h1").first().text().trim();
  const pageTitle = $("title").first().text().trim();

  // Preferujeme H1 (čistší text), <title> jako záloha
  const primaryText = h1Text.length > 10 ? h1Text : pageTitle;

  // Plocha: "76 m²" nebo "76 m2" nebo "76m²"
  const areaMatch = primaryText.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  const areaFromH1 = areaMatch
    ? parseFloat(areaMatch[1].replace(",", "."))
    : null;

  const dispFromH1 = parseDisposition(primaryText);

  // Titulek — H1 preferován před <title> (bez "| Bezrealitky.cz" smetí)
  const title = h1Text.length > 5
    ? cleanTitle(h1Text, "Bezrealitky\\.cz", "bezrealitky")
    : null;

  // ── OG meta tagy: kompletní shrnutí v čistém textu ────────────────────────
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  const ogDesc  =
    $('meta[property="og:description"]').attr("content")?.trim() ??
    $('meta[name="description"]').attr("content")?.trim() ??
    "";

  const metaCombined = `${ogTitle} ${ogDesc}`;
  const areaFromMeta  = parseArea(metaCombined);
  const dispFromMeta  = parseDisposition(metaCombined);

  const usableArea  = areaFromH1 ?? areaFromMeta;
  const disposition = dispFromH1 ?? dispFromMeta;

  // ── Cena: kaskáda 4 metod (Bezrealitky ji nezveřejňuje v OG meta) ─────────
  //
  // Metoda A: OG meta (funguje jen někdy)
  let price: number | null = parsePrice(metaCombined);

  // Metoda B: viditelný text stránky přes Cheerio — "9 799 900 Kč"
  //   Bezrealitky formátuje ceny s nezalomitelnými mezerami ( )
  if (!price) {
    const bodyText = $("body").text();
    const m = bodyText.match(/(\d{1,3}(?:[\s ]\d{3})+)\s*Kč/);
    if (m) {
      const n = parseInt(m[1].replace(/[\s ]/g, ""), 10);
      if (n > 50_000) price = n;
    }
  }

  // Metoda C: JSON klíče v inline skriptech (Apollo / NEXT_DATA fallback)
  if (!price) {
    const jm = html.match(
      /"(?:price|totalPrice|advertisingPrice|priceValue|amount)"\s*:\s*(\d{5,})/i
    );
    if (jm) {
      const n = parseInt(jm[1], 10);
      if (n > 50_000) price = n;
    }
  }

  // Metoda D: poslední záchrana — libovolné číslo ≥ 5 číslic před Kč/CZK
  if (!price) {
    const hm = html.slice(0, 120_000).match(/([\d][\d\s ]{4,})\s*(?:Kč|CZK)/i);
    if (hm) {
      const n = parseInt(hm[1].replace(/[\s ]/g, ""), 10);
      if (n > 50_000) price = n;
    }
  }

  // ── Adresa pod H1 ─────────────────────────────────────────────────────────
  // Bezrealitky zobrazuje adresu (např. "Poznaňská, Praha - Bohnice") těsně
  // pod nadpisem. Prohledáme sourozence H1 a address-related selektory.
  let addressText: string | null = null;
  let municipality: string | null = null;

  const h1El = $("h1").first();
  const addressCandidates: string[] = [];

  // Sourozenci H1 (prvních 6 elementů za ním)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  h1El.nextAll().slice(0, 6).each((_: number, el: any) => {
    const t = $(el).text().trim().replace(/\s+/g, " ");
    if (t.length > 3 && t.length < 160) addressCandidates.push(t);
  });

  // Přímé potomky rodiče H1 (pro flex/grid layout)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  h1El.parent().children().each((_: number, el: any) => {
    const t = $(el).text().trim().replace(/\s+/g, " ");
    if (t !== h1Text && t.length > 3 && t.length < 160) addressCandidates.push(t);
  });

  // Explicitní address/location selektory (class-based)
  $(
    "address, [class*='address'], [class*='location'], [class*='locality'], " +
    "[class*='adresa'], [class*='ulice'], [class*='street']"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).each((_: number, el: any) => {
    const t = $(el).text().trim().replace(/\s+/g, " ");
    if (t.length > 3 && t.length < 160) addressCandidates.push(t);
  });

  // První kandidát obsahující název českého města → adresa
  for (const candidate of addressCandidates) {
    if (CZECH_CITIES.test(candidate)) {
      addressText = candidate;
      const cityMatch = candidate.match(CZECH_CITIES);
      if (cityMatch) {
        // "Poznaňská, Praha - Bohnice" → municipality = "Praha - Bohnice"
        const fromCity = candidate.slice(candidate.indexOf(cityMatch[0]));
        municipality = fromCity.split(/[,\n]/)[0].trim();
      }
      break;
    }
  }

  // Záloha: adresa z OG description (regex na "Ulice, Praha - Část")
  if (!addressText && ogDesc) {
    const addrRe =
      /([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž\s\d]+,\s*(?:Praha|Brno|Ostrava|Plzeň|Liberec|Olomouc|Hradec|Pardubice|Zlín)[^.\n,]{0,40})/;
    const m = ogDesc.match(addrRe);
    if (m) {
      addressText = m[1].trim();
      const cityMatch = m[1].match(CZECH_CITIES);
      if (cityMatch) municipality = cityMatch[0];
    }
  }

  const hasData = usableArea ?? disposition ?? title ?? addressText ?? price;
  if (!hasData) return null;

  console.log(
    `[bezrealitky] ✓ Visual DOM — ` +
    `cena=${price ?? "N/A"} Kč | plocha=${usableArea ?? "N/A"} m² | ` +
    `disp="${disposition ?? "N/A"}" | adresa="${addressText ?? "N/A"}"`
  );

  return {
    title:       title ?? undefined,
    price:       price ?? 0,
    usableArea:  usableArea ?? null,
    disposition,
    municipality,
    addressText,
  };
}

// ---------------------------------------------------------------------------
// Pomocná extrakce z raw JSON v inline skriptech
// Bezrealitky někdy vkládá GraphQL response přímo jako window.__INITIAL_STATE__
// ---------------------------------------------------------------------------

function extractFromInlineScripts(html: string): Partial<PortalMetadata> | null {
  // Hledáme JSON objekt s price a (name nebo usableArea) v <script> tazích
  const scriptRe = /<script[^>]*>([\s\S]{50,50000}?)<\/script>/gi;
  let m: RegExpExecArray | null;

  while ((m = scriptRe.exec(html)) !== null) {
    const src = m[1];
    if (!src.includes('"price"') && !src.includes('"usableArea"')) continue;

    const priceMatch = src.match(/"price"\s*:\s*(\d{5,})/);
    const areaMatch = src.match(/"usableArea"\s*:\s*(\d+(?:\.\d+)?)/);
    const nameMatch = src.match(/"(?:name|title|heading)"\s*:\s*"([^"]{5,200})"/);

    if (priceMatch || areaMatch) {
      const price = priceMatch ? parseInt(priceMatch[1], 10) : 0;
      const area = areaMatch ? parseFloat(areaMatch[1]) : null;
      const title = nameMatch ? nameMatch[1] : null;

      if (price > 10_000 || area) {
        console.log(`[bezrealitky] ✓ inline script — cena=${price} Kč | plocha=${area ?? "?"} m²`);
        return {
          title: title?.slice(0, 300) ?? undefined,
          price,
          usableArea: area,
        };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Hlavní fetch funkce
// ---------------------------------------------------------------------------

export async function fetchBezrealitkyMetadata(url: string): Promise<PortalMetadata> {
  const { id, disposition: slugDisp, municipality: slugMuni, transactionType } =
    parseSlug(url);

  console.log(`\n[bezrealitky] ══ Začíná import inzerátu ${id} ══`);

  const base: PortalMetadata = {
    externalId: id,
    title: `${transactionType === "pronájem" ? "Pronájem" : "Prodej"} nemovitosti — Bezrealitky #${id}`,
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

  // Session-aware fetch (Bezrealitky má anti-bot ochranu)
  const html =
    (await fetchHtmlWithSession(url, BZR_ORIGIN, 16_000)) ??
    (await fetchHtml(url, 14_000));

  if (!html) {
    console.error(`[bezrealitky][${id}] HTML nedostupný — vracím základ ze slug`);
    return base;
  }

  console.log(`[bezrealitky][${id}] HTML stažen (${Math.round(html.length / 1024)} KB)`);

  // ── Strategie 1–4 (JSON/Apollo/OG) ─────────────────────────────────────
  let enriched: Partial<PortalMetadata> | null =
    extractFromNextData(html) ??
    extractFromJsonLd(html) ??
    extractFromInlineScripts(html) ??
    extractFromOgAndRegex(html);

  // ── Visual DOM (vždy) — doplňuje mezery z H1 + adresních elementů ──────
  const visual = extractFromVisualDom(html);

  if (visual) {
    if (!enriched) {
      enriched = visual;
    } else {
      // Doplňujeme pouze chybějící hodnoty (Visual DOM nepřepisuje spolehlivější JSON data)
      if ((!enriched.price || enriched.price === 0) && visual.price && visual.price > 0) {
        enriched = { ...enriched, price: visual.price };
        console.log(`[bezrealitky] Visual DOM doplnil cenu: ${visual.price.toLocaleString("cs-CZ")} Kč`);
      }
      if (!enriched.usableArea  && visual.usableArea)  enriched = { ...enriched, usableArea:  visual.usableArea };
      if (!enriched.disposition && visual.disposition) enriched = { ...enriched, disposition: visual.disposition };
      if (!enriched.municipality && visual.municipality) enriched = { ...enriched, municipality: visual.municipality };
      if (!enriched.addressText  && visual.addressText)  enriched = { ...enriched, addressText:  visual.addressText };
      // Titulek: přepíšeme jen generický fallback
      if ((!enriched.title || enriched.title.length < 10) && visual.title) {
        enriched = { ...enriched, title: visual.title };
      }
    }
  }

  if (!enriched) {
    console.error(`[bezrealitky][${id}] Všechny strategie včetně Visual DOM selhaly`);
    return base;
  }

  // ── Merge do base — slug jako ultimate fallback ──────────────────────────
  if (enriched.title) base.title = enriched.title;
  if (enriched.price !== undefined && enriched.price > 0) base.price = enriched.price;
  if (enriched.usableArea) base.usableArea = enriched.usableArea;
  if (enriched.disposition) base.disposition = enriched.disposition;
  else if (slugDisp) base.disposition = slugDisp;
  if (enriched.municipality) base.municipality = enriched.municipality;
  else if (slugMuni) base.municipality = slugMuni;
  if (enriched.addressText) base.addressText = enriched.addressText;
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

  console.log(
    `[bezrealitky][${id}] ══ DOKONČEN ══ ` +
    `${base.price.toLocaleString("cs-CZ")} Kč | ${base.usableArea ?? "?"} m² | ` +
    `"${base.municipality ?? "?"}" | isPartial=${base.isPartial}\n`
  );

  return base;
}
