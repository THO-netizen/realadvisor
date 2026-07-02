// Sdílené utility pro portálové adaptéry — HTML fetch, parsery, extraktory.
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Browser impersonation headers
// ---------------------------------------------------------------------------

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Kompletní sada hlaviček pro navigaci (jako kdybychom klikli na odkaz)
const BROWSER_HEADERS_HTML: Record<string, string> = {
  "User-Agent": CHROME_UA,
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "cs,en-US;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "DNT": "1",
};

// Hlavičky pro XHR/fetch API volání (same-origin CORS)
const BROWSER_HEADERS_JSON: Record<string, string> = {
  "User-Agent": CHROME_UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "cs,en-US;q=0.9,en;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  "Cache-Control": "no-cache",
  "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
};

export const FETCH_UA = CHROME_UA;

// ---------------------------------------------------------------------------
// Retry timing helpers
// ---------------------------------------------------------------------------

function jitterMs(baseMs: number, rangeMs = 400): number {
  return baseMs + Math.floor(Math.random() * rangeMs);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Proxy fallback — obejití WAF blokující datacenter IP adresy
//
// Když přímý request vrátí 403 (Sreality, Bezrealitky blokují Render/AWS/GCP),
// zkusíme request přes veřejné CORS proxy. Proxy skryje naši IP.
//
// Pořadí: allorigins (nejspolehlivější) → corsproxy → codetabs
// ---------------------------------------------------------------------------

const PROXY_BUILDERS: ReadonlyArray<(url: string) => string> = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

async function tryViaProxy(
  targetUrl: string,
  parseAs: "json",
  timeoutMs?: number
): Promise<unknown | null>;
async function tryViaProxy(
  targetUrl: string,
  parseAs: "text",
  timeoutMs?: number
): Promise<string | null>;
async function tryViaProxy(
  targetUrl: string,
  parseAs: "json" | "text",
  timeoutMs = 18_000
): Promise<unknown> {
  console.log(`[portal-utils] ⚡ Proxy bypass spuštěn pro: ${targetUrl}`);

  for (const buildProxy of PROXY_BUILDERS) {
    const proxyUrl = buildProxy(targetUrl);
    console.log(`[portal-utils] → proxy: ${proxyUrl.slice(0, 80)}…`);

    try {
      const res = await fetch(proxyUrl, {
        headers: {
          "User-Agent": CHROME_UA,
          Accept: parseAs === "json"
            ? "application/json, text/plain, */*"
            : "text/html,application/xhtml+xml,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (!res.ok) {
        console.warn(`[portal-utils] Proxy HTTP ${res.status}: ${proxyUrl.slice(0, 60)}…`);
        await sleep(800);
        continue;
      }

      if (parseAs === "json") {
        const text = await res.text();
        // Ochrana: proxy může vrátit HTML chybovou stránku i při status 200
        if (text.trimStart().startsWith("<")) {
          console.warn(`[portal-utils] Proxy vrátil HTML místo JSON: ${proxyUrl.slice(0, 60)}…`);
          await sleep(600);
          continue;
        }
        const data = JSON.parse(text);
        console.log(`[portal-utils] ✓ Proxy JSON OK: ${proxyUrl.slice(0, 60)}…`);
        return data;
      } else {
        const text = await res.text();
        if (text.length < 200) {
          console.warn(`[portal-utils] Proxy vrátil příliš krátký HTML: ${text.slice(0, 80)}`);
          await sleep(600);
          continue;
        }
        console.log(`[portal-utils] ✓ Proxy HTML OK (${Math.round(text.length / 1024)} KB): ${proxyUrl.slice(0, 60)}…`);
        return text;
      }
    } catch (err) {
      console.warn(`[portal-utils] Proxy výjimka: ${(err as Error).message}`);
      await sleep(600);
    }
  }

  console.error(`[portal-utils] ✗ Všechny proxy selhaly pro: ${targetUrl}`);
  return null;
}

// ---------------------------------------------------------------------------
// fetchHtml — generický HTML fetch s retry (3 pokusy)
// ---------------------------------------------------------------------------

export async function fetchHtml(
  url: string,
  timeoutMs = 12_000
): Promise<string | null> {
  const headers: Record<string, string> = {
    ...BROWSER_HEADERS_HTML,
    Referer: "https://www.google.com/",
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await sleep(jitterMs(1_500, 2_000));

    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (res.ok) return await res.text();

      console.warn(
        `[portal-utils] fetchHtml HTTP ${res.status} (pokus ${attempt}/3) pro: ${url}`
      );

      if (res.status !== 403 && res.status !== 429) return null;
    } catch (err) {
      console.warn(
        `[portal-utils] fetchHtml výjimka (pokus ${attempt}/3): ${(err as Error).message}`
      );
    }
  }

  // Proxy fallback — poslední záchrana
  return (await tryViaProxy(url, "text")) as string | null;
}

// ---------------------------------------------------------------------------
// fetchHtmlWithSession — session-aware fetch pro weby s anti-bot ochranou
//
// Krok 1: GET na originUrl → extrahuj Set-Cookie
// Krok 2: GET na targetUrl s cookies + Referer = originUrl
// ---------------------------------------------------------------------------

export async function fetchHtmlWithSession(
  targetUrl: string,
  originUrl: string,
  timeoutMs = 14_000
): Promise<string | null> {
  // ── Krok 1: "přistání" na hlavní stránce → získáme cookies ───────────────
  let cookies = "";
  try {
    console.log(`[portal-utils] Session init: GET ${originUrl}`);
    const initRes = await fetch(originUrl, {
      headers: { ...BROWSER_HEADERS_HTML, Referer: "https://www.google.com/" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    const setCookie = initRes.headers.get("set-cookie");
    if (setCookie) {
      cookies = setCookie
        .split(/,(?=[^;]+=)/)           // správné rozdělení vícehodnotového hlavičky
        .map((c) => c.split(";")[0].trim())
        .filter(Boolean)
        .join("; ");
      console.log(`[portal-utils] Session cookies: ${cookies.slice(0, 80)}…`);
    }
  } catch (err) {
    console.warn(`[portal-utils] Session init selhal: ${(err as Error).message}`);
  }

  // ── Krok 2: náhodný delay (imituje lidský pohyb myší) ────────────────────
  await sleep(jitterMs(200, 600));

  // ── Krok 3: cílový request s cookies + Referer = origin ──────────────────
  const targetHeaders: Record<string, string> = {
    ...BROWSER_HEADERS_HTML,
    Referer: originUrl + "/",
    "Sec-Fetch-Site": "same-origin",
    ...(cookies ? { Cookie: cookies } : {}),
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await sleep(jitterMs(2_000, 2_500));

    try {
      console.log(
        `[portal-utils] fetchHtmlWithSession GET ${targetUrl} (pokus ${attempt}/3)`
      );
      const res = await fetch(targetUrl, {
        headers: targetHeaders,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (res.ok) {
        console.log(`[portal-utils] ✓ HTML OK (${res.status})`);
        return await res.text();
      }

      console.warn(
        `[portal-utils] fetchHtmlWithSession HTTP ${res.status} (pokus ${attempt}/3)`
      );
      if (res.status !== 403 && res.status !== 429) return null;
    } catch (err) {
      console.warn(
        `[portal-utils] fetchHtmlWithSession výjimka (pokus ${attempt}/3): ${(err as Error).message}`
      );
    }
  }

  // ── Proxy fallback: datacenter IP blokována WAF ───────────────────────────
  console.warn(
    `[portal-utils] Přímý přístup blokován (WAF/IP ban). Spouštím proxy fallback…`
  );
  return (await tryViaProxy(targetUrl, "text")) as string | null;
}

// ---------------------------------------------------------------------------
// fetchJson — JSON API fetch s retry (3 pokusy)
// ---------------------------------------------------------------------------

export async function fetchJson<T = unknown>(
  url: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 12_000
): Promise<T | null> {
  const headers: Record<string, string> = { ...BROWSER_HEADERS_JSON, ...extraHeaders };

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await sleep(jitterMs(1_200, 1_800));

    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (res.ok) return (await res.json()) as T;

      console.warn(
        `[portal-utils] fetchJson HTTP ${res.status} (pokus ${attempt}/3) pro: ${url}`
      );
      if (res.status !== 403 && res.status !== 429) return null;
    } catch (err) {
      console.warn(
        `[portal-utils] fetchJson výjimka (pokus ${attempt}/3): ${(err as Error).message}`
      );
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// fetchJsonWithSession — session-aware JSON API fetch
//
// Krok 1: GET na originUrl → extrahuj Set-Cookie (anti-bot bypass)
// Krok 2: GET na apiUrl s cookies + správnými CORS hlavičkami
// ---------------------------------------------------------------------------

export async function fetchJsonWithSession<T = unknown>(
  apiUrl: string,
  originUrl: string,
  extraHeaders: Record<string, string> = {},
  timeoutMs = 14_000
): Promise<T | null> {
  // ── Krok 1: session init ────────────────────────────────────────────────
  let cookies = "";
  try {
    console.log(`[portal-utils] JSON session init: GET ${originUrl}`);
    const initRes = await fetch(originUrl, {
      headers: { ...BROWSER_HEADERS_HTML, Referer: "https://www.google.com/" },
      signal: AbortSignal.timeout(7_000),
      cache: "no-store",
    });
    const setCookie = initRes.headers.get("set-cookie");
    if (setCookie) {
      cookies = setCookie
        .split(/,(?=[^;]+=)/)
        .map((c) => c.split(";")[0].trim())
        .filter(Boolean)
        .join("; ");
      console.log(`[portal-utils] JSON session cookies: ${cookies.slice(0, 80)}…`);
    }
  } catch (err) {
    console.warn(`[portal-utils] JSON session init selhal: ${(err as Error).message}`);
  }

  await sleep(jitterMs(150, 400));

  // ── Krok 2: API call s session cookies ──────────────────────────────────
  const apiHeaders: Record<string, string> = {
    ...BROWSER_HEADERS_JSON,
    Referer: originUrl + "/",
    Origin: originUrl,
    "Sec-Fetch-Site": "same-origin",
    ...(cookies ? { Cookie: cookies } : {}),
    ...extraHeaders,
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await sleep(jitterMs(1_500, 2_000));

    try {
      console.log(
        `[portal-utils] fetchJsonWithSession GET ${apiUrl} (pokus ${attempt}/3)`
      );
      const res = await fetch(apiUrl, {
        headers: apiHeaders,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });

      if (res.ok) {
        console.log(`[portal-utils] ✓ JSON API OK (${res.status})`);
        return (await res.json()) as T;
      }

      console.warn(
        `[portal-utils] fetchJsonWithSession HTTP ${res.status} (pokus ${attempt}/3)`
      );
      if (res.status !== 403 && res.status !== 429) return null;
    } catch (err) {
      console.warn(
        `[portal-utils] fetchJsonWithSession výjimka (pokus ${attempt}/3): ${(err as Error).message}`
      );
    }
  }

  // ── Proxy fallback: datacenter IP blokována WAF ───────────────────────────
  console.warn(
    `[portal-utils] JSON API blokován (WAF/IP ban). Spouštím proxy fallback…`
  );
  return (await tryViaProxy(apiUrl, "json")) as T | null;
}

// ---------------------------------------------------------------------------
// Cheerio
// ---------------------------------------------------------------------------

export function loadCheerio(html: string) {
  return cheerio.load(html);
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

export function extractJsonLd(html: string): Record<string, unknown> | null {
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>\s*([\s\S]*?)\s*<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const obj = JSON.parse(m[1]) as Record<string, unknown>;
      if (
        obj["@type"] &&
        (String(obj["@type"]).includes("RealEstate") ||
          String(obj["@type"]).includes("Product") ||
          String(obj["@type"]).includes("Offer") ||
          obj.price !== undefined ||
          obj.name !== undefined)
      ) {
        return obj;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export function extractNextData(html: string): Record<string, unknown> | null {
  const m = html.match(
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>\s*(\{[\s\S]*?\})\s*<\/script>/i
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function extractOgMeta(html: string, property: string): string | null {
  for (const re of [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i"),
  ]) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim() ?? null;
}

export function htmlToText(html: string, maxChars = 4_000): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

// ---------------------------------------------------------------------------
// Parsery hodnot
// ---------------------------------------------------------------------------

export function parsePrice(text: string): number | null {
  const clean = text.replace(/ /g, " ");
  const m = clean.match(/([\d\s.,]+)\s*(?:K[cč]|CZK)/i);
  if (!m) return null;
  const raw = m[1].replace(/[\s.]/g, "").replace(",", ".");
  const n = parseFloat(raw);
  return isNaN(n) || n <= 0 ? null : Math.round(n);
}

export function parseArea(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*m[²2]/i);
  if (!m) return null;
  return parseInt(m[1].replace(",", "."), 10) || null;
}

export function parseDisposition(text: string): string | null {
  const m = text.match(/\b(\d)\s*[+]\s*(kk|\d)\b/i);
  if (!m) return null;
  return `${m[1]}+${m[2].toLowerCase()}`;
}

export function parseEnergyLabel(text: string): string | null {
  const m = text.match(
    /\b(třída\s+)?energetick[áa]?\s+(?:třída\s+|náročnost[^:]*:\s*)?([A-G])\b/i
  );
  return m?.[2]?.toUpperCase() ?? null;
}

export function parseFloor(
  text: string
): { floor: number | null; totalFloors: number | null } {
  const m =
    text.match(/(\d+)\s*\.?\s*(?:z|ze|\/)\s*(\d+)/i) ??
    text.match(/podla[žz][íi]\s*:?\s*(\d+)/i);
  if (!m) return { floor: null, totalFloors: null };
  if (m[2]) return { floor: parseInt(m[1], 10), totalFloors: parseInt(m[2], 10) };
  return { floor: parseInt(m[1], 10), totalFloors: null };
}

export function parseOwnership(text: string): "OV" | "DV" | "OTHER" | null {
  if (/osobn[íi]\s+vlastnictv[íi]|OV\b/i.test(text)) return "OV";
  if (/družstevn[íi]|DV\b/i.test(text)) return "DV";
  if (/vlastnictv[íi]/i.test(text)) return "OTHER";
  return null;
}

export function parseCondition(
  text: string
): "NEW" | "GOOD" | "AVERAGE" | "BAD" | "RECONSTRUCTION" | null {
  if (/novostavba|nový\s+byt/i.test(text)) return "NEW";
  if (/velmi\s+dobr[ýy]|výborn[ýy]/i.test(text)) return "GOOD";
  if (/dobr[ýy]\s+stav|dobrém\s+stavu/i.test(text)) return "GOOD";
  if (/průměrn[ýy]/i.test(text)) return "AVERAGE";
  if (/po\s+rekonstrukci|rekonstruovan[ýy]/i.test(text)) return "GOOD";
  if (/k\s+rekonstrukci|nutná\s+rekonstrukce/i.test(text)) return "RECONSTRUCTION";
  if (/špatn[ýy]|zdevastovan[ýy]/i.test(text)) return "BAD";
  return null;
}

export function extractNumericId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    for (const seg of segments) {
      const m = seg.match(/^(\d{5,})/);
      if (m) return m[1];
    }
    const m = parsed.pathname.match(/\/(\d{5,})/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

export function cleanTitle(title: string, ...brands: string[]): string {
  let t = title;
  for (const brand of brands) {
    t = t.replace(new RegExp(`\\s*[|\\-–]\\s*${brand}.*$`, "i"), "");
  }
  return t.trim().slice(0, 300);
}
