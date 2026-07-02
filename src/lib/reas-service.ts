// Reas.cz cenová mapa
//
// Pořadí fetch strategií:
//   1) Přímý HTTP s browser hlavičkami
//   2) ScraperAPI (pokud SCRAPER_API_KEY nastaven)
//   3) Veřejný proxy řetězec: allorigins → corsproxy → codetabs
//
// Municipality retry:
//   pokus 1: plná adresa  ("Praha - Bohnice")
//   pokus 2: zkrácená     ("Praha")        — pokud se liší

import * as cheerio from "cheerio";

const REAS_BASE = "https://www.reas.cz";
const REAS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

export interface ReasPriceData {
  municipality: string;
  medianPricePerM2: number;
  sampleCount: number;
  source: "reas";
  fetchedAt: string;
}

export function isReasConfigured(): boolean {
  return true;
}

// ---------------------------------------------------------------------------
// In-memory cache (6 hodin)
// ---------------------------------------------------------------------------

const priceCache = new Map<string, { data: ReasPriceData; expiresAt: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Sanitizace municipality
//
// "Praha - Bohnice"  → "Praha"
// "Praha 10 - Vršovice" → "Praha 10"
// "Brno-střed" zůstane (pomlčka bez okolních mezer)
// ---------------------------------------------------------------------------

function simplifyMunicipality(raw: string): string {
  return raw.replace(/\s+[-–—]\s+.+$/, "").trim();
}

// ---------------------------------------------------------------------------
// Veřejné proxy buildery (stejná sada jako portal-utils)
// ---------------------------------------------------------------------------

const PROXY_BUILDERS: ReadonlyArray<(url: string) => string> = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

// ---------------------------------------------------------------------------
// fetchText — přímý fetch → ScraperAPI → proxy chain
//
// Loguje HTTP status a snippet chyby, aby bylo vidět přesně co blokuje.
// ---------------------------------------------------------------------------

async function fetchText(
  url: string,
  accept: string,
  timeoutMs = 14_000,
): Promise<string | null> {
  const directHeaders = {
    "User-Agent": REAS_UA,
    Accept: accept,
    "Accept-Language": "cs-CZ,cs;q=0.9,en;q=0.8",
    Referer: "https://www.google.com/",
    "Cache-Control": "no-cache",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
  };

  // ── Krok 1: přímý fetch ────────────────────────────────────────────────────
  try {
    const res = await fetch(url, {
      headers: directHeaders,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    const body = await res.text();

    if (res.ok && body.length > 50) {
      console.log(`[reas-service] ✓ Přímý fetch OK (HTTP ${res.status}, ${Math.round(body.length / 1024)} KB): ${url}`);
      return body;
    }

    // Detailní log chyby — vidíme co Reas vrátil
    const snippet = body.slice(0, 300).replace(/\s+/g, " ");
    console.warn(`[reas-service] Reas error: HTTP ${res.status} pro ${url}`);
    console.warn(`[reas-service] Reas response body: ${snippet}`);

    // Jen 403/429 jdou do proxy — ostatní chyby rovnou vzdáme
    if (res.status !== 403 && res.status !== 429) return null;

    console.log(`[reas-service] HTTP ${res.status} — spouštím proxy bypass`);
  } catch (err) {
    console.warn(`[reas-service] Přímý fetch selhal: ${(err as Error).message} — spouštím proxy bypass`);
  }

  // ── Krok 2: ScraperAPI (pokud nastaven) ───────────────────────────────────
  if (SCRAPER_API_KEY) {
    const scraperUrl =
      `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}` +
      `&url=${encodeURIComponent(url)}&render=true`;
    console.log(`[reas-service] ScraperAPI: ${url}`);
    try {
      const res = await fetch(scraperUrl, {
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
      const body = await res.text();

      if (res.ok && body.length > 100) {
        console.log(`[reas-service] ✓ ScraperAPI OK (HTTP ${res.status}, ${Math.round(body.length / 1024)} KB)`);
        return body;
      }
      console.warn(`[reas-service] ScraperAPI error: HTTP ${res.status} — ${body.slice(0, 200)}`);
    } catch (err) {
      console.warn(`[reas-service] ScraperAPI selhal: ${(err as Error).message}`);
    }
  }

  // ── Krok 3: veřejný proxy řetězec ─────────────────────────────────────────
  console.log(`[reas-service] Veřejné proxy pro: ${url}`);
  for (const buildProxy of PROXY_BUILDERS) {
    const proxyUrl = buildProxy(url);
    console.log(`[reas-service] → ${proxyUrl.slice(0, 80)}…`);
    try {
      const res = await fetch(proxyUrl, {
        headers: { "User-Agent": REAS_UA, Accept: accept },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });

      const body = await res.text();

      if (!res.ok) {
        console.warn(`[reas-service] Proxy HTTP ${res.status}: ${body.slice(0, 100)}`);
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }

      // Proxy může vrátit JSON chybovou obálku nebo prázdnou stránku
      if (body.length < 200) {
        console.warn(`[reas-service] Proxy: příliš krátká odpověď (${body.length} B)`);
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      if (body.trimStart().startsWith('{"error"') || body.trimStart().startsWith('{"status"')) {
        console.warn(`[reas-service] Proxy: JSON error: ${body.slice(0, 120)}`);
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      console.log(`[reas-service] ✓ Proxy OK (${Math.round(body.length / 1024)} KB): ${proxyUrl.slice(0, 70)}…`);
      return body;
    } catch (err) {
      console.warn(`[reas-service] Proxy výjimka: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  console.error(`[reas-service] ✗ Všechny metody selhaly pro: ${url}`);
  return null;
}

// ---------------------------------------------------------------------------
// JSON API pokus
// ---------------------------------------------------------------------------

async function tryReasApi(
  municipality: string,
  lat?: number | null,
  lng?: number | null,
): Promise<number | null> {
  const candidates = [
    `${REAS_BASE}/api/v1/price-map?municipality=${encodeURIComponent(municipality)}&type=apartment`,
    `${REAS_BASE}/api/cenovamapa/data?q=${encodeURIComponent(municipality)}`,
    ...(lat && lng
      ? [`${REAS_BASE}/api/v1/price-map?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}&radius=2000`]
      : []),
  ];

  for (const url of candidates) {
    console.log(`[reas-service] JSON API: ${url}`);
    const text = await fetchText(url, "application/json, text/plain, */*");
    if (!text || text.trimStart().startsWith("<")) continue;

    try {
      const raw = JSON.parse(text) as Record<string, unknown>;
      const payload = (raw["data"] ?? raw["result"] ?? raw["priceMap"] ?? raw) as Record<string, unknown>;
      const val =
        payload["medianPricePerM2"] ??
        payload["median_price_per_m2"] ??
        payload["median"] ??
        payload["medianPrice"] ??
        payload["price_per_m2"] ??
        payload["pricePerM2"];

      const n = typeof val === "number" ? val : typeof val === "string" ? parseFloat(val) : NaN;
      if (!isNaN(n) && n > 5_000) {
        console.log(`[reas-service] ✓ JSON API: ${Math.round(n)} Kč/m² pro "${municipality}"`);
        return Math.round(n);
      }
      console.warn(`[reas-service] JSON API: žádná cena v payload: ${JSON.stringify(payload).slice(0, 200)}`);
    } catch (e) {
      console.warn(`[reas-service] JSON API parse error: ${(e as Error).message}`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTML scraping
// ---------------------------------------------------------------------------

async function tryReasHtml(municipality: string): Promise<number | null> {
  const url = `${REAS_BASE}/cenovamapa/?q=${encodeURIComponent(municipality)}`;
  console.log(`[reas-service] HTML cenová mapa: ${url}`);

  const html = await fetchText(url, "text/html,application/xhtml+xml,*/*;q=0.8");
  if (!html) return null;

  const $ = cheerio.load(html);

  // CSS selektory reas.cz
  const selectors = [
    "[data-price-per-m2]",
    "[data-median-price]",
    ".price-per-m2",
    ".median-price",
    ".price-map__median",
    ".price-map-value",
    ".cena-m2",
    "#median-price",
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (!el.length) continue;
    const raw = el.attr("data-price-per-m2") ?? el.attr("data-median-price") ?? el.text();
    const price = parseInt(raw.replace(/\D/g, ""), 10);
    if (price > 5_000 && price < 500_000) {
      console.log(`[reas-service] ✓ HTML selector "${sel}": ${price} Kč/m²`);
      return price;
    }
  }

  // Regex na celý text stránky: "65 000 Kč/m²"
  const pageText = $.text();
  const rxKcM2 = /(\d[\d\s ]{2,})\s*(?:Kč\/m[²2]|Kc\/m2)/gi;
  let m: RegExpExecArray | null;
  while ((m = rxKcM2.exec(pageText)) !== null) {
    const price = parseInt(m[1].replace(/[\s ]/g, ""), 10);
    if (price > 5_000 && price < 500_000) {
      console.log(`[reas-service] ✓ HTML regex: ${price} Kč/m²`);
      return price;
    }
  }

  // JSON fragmenty v inline skriptech (Next.js/React hydration)
  const scriptRx = /<script[^>]*>([\s\S]{20,30000}?)<\/script>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = scriptRx.exec(html)) !== null) {
    const src = sm[1];
    const jm = src.match(/"(?:medianPrice|median|pricePerM2|price_per_m2)"\s*:\s*(\d{4,6})/);
    if (jm) {
      const price = parseInt(jm[1], 10);
      if (price > 5_000 && price < 500_000) {
        console.log(`[reas-service] ✓ HTML inline script JSON: ${price} Kč/m²`);
        return price;
      }
    }
  }

  // Poslední záchrana: jakékoli číslo 5–6 číslic za textem "cena"
  const cenaMatch = html.match(/cen[ay][^<]{0,60}?(\d{4,6})/i);
  if (cenaMatch) {
    const price = parseInt(cenaMatch[1], 10);
    if (price > 5_000 && price < 500_000) {
      console.log(`[reas-service] ✓ HTML "cena" regex: ${price} Kč/m²`);
      return price;
    }
  }

  console.warn(`[reas-service] HTML: cena nenalezena pro "${municipality}"`);
  return null;
}

// ---------------------------------------------------------------------------
// Jeden kompletní dotaz pro danou municipality variantu
// ---------------------------------------------------------------------------

async function queryMunicipality(
  municipality: string,
  lat?: number | null,
  lng?: number | null,
): Promise<number | null> {
  return (
    (await tryReasApi(municipality, lat, lng)) ??
    (await tryReasHtml(municipality))
  );
}

// ---------------------------------------------------------------------------
// Veřejné API
// ---------------------------------------------------------------------------

export async function getReasPriceData(
  municipality: string,
  gpsLat?: number | null,
  gpsLng?: number | null,
): Promise<ReasPriceData | null> {
  const simplified = simplifyMunicipality(municipality);
  const variants = simplified !== municipality
    ? [municipality, simplified]   // "Praha - Bohnice" → zkusíme obojí
    : [municipality];

  // Cache check (používáme simplified jako klíč)
  const cacheKey = `${simplified}|${gpsLat?.toFixed(3) ?? ""}|${gpsLng?.toFixed(3) ?? ""}`;
  const cached = priceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[reas-service] Cache hit: "${simplified}"`);
    return cached.data;
  }

  console.log(`[reas-service] ══ Dotaz Reas pro: "${municipality}" (varianty: ${variants.map((v) => `"${v}"`).join(", ")}) ══`);

  let medianPricePerM2: number | null = null;
  let usedMunicipality = simplified;

  for (const variant of variants) {
    console.log(`[reas-service] Zkouším variantu: "${variant}"`);
    medianPricePerM2 = await queryMunicipality(variant, gpsLat, gpsLng);
    if (medianPricePerM2) {
      usedMunicipality = variant;
      break;
    }
    console.warn(`[reas-service] Žádná data pro "${variant}" — ${variants.indexOf(variant) + 1 < variants.length ? "zkouším zkrácenou variantu" : "vzdávám se"}`);
  }

  if (!medianPricePerM2) {
    console.warn(`[reas-service] ✗ Data nedostupná pro žádnou variantu: ${variants.map((v) => `"${v}"`).join(", ")}`);
    return null;
  }

  const data: ReasPriceData = {
    municipality: usedMunicipality,
    medianPricePerM2,
    sampleCount: 0,
    source: "reas",
    fetchedAt: new Date().toISOString(),
  };

  priceCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  console.log(`[reas-service] ══ ✓ ${usedMunicipality}: ${medianPricePerM2.toLocaleString("cs-CZ")} Kč/m² ══`);
  return data;
}

export async function testReasConnection(
  testMunicipality = "Praha",
): Promise<{ ok: boolean; data?: ReasPriceData; error?: string }> {
  try {
    const data = await getReasPriceData(testMunicipality);
    if (!data) return { ok: false, error: "Reas nevrátil data pro testovací obec." };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
