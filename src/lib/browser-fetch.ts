// Anti-WAF browser fetch — ScraperAPI nebo Puppeteer Stealth
//
// Pořadí:
//   1) ScraperAPI — pokud je SCRAPER_API_KEY nastavena (cloud-friendly, žádná RAM)
//   2) Puppeteer Stealth — headless Chrome s evasion pluginem
//   3) throw "Detekován firewall Srealit, data nelze stáhnout."

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

// Ochrana před opakovanou registrací stealth pluginu
let stealthRegistered = false;

// ---------------------------------------------------------------------------
// Veřejné API
// ---------------------------------------------------------------------------

export async function browserFetchHtml(url: string, timeoutMs = 45_000): Promise<string> {
  if (SCRAPER_API_KEY) {
    console.log(`[browser-fetch] Použití ScraperAPI pro: ${url}`);
    return fetchViaScraperApi(url, timeoutMs);
  }

  console.log(`[browser-fetch] Použití Puppeteer Stealth pro: ${url}`);
  return fetchViaPuppeteer(url, timeoutMs);
}

// ---------------------------------------------------------------------------
// ScraperAPI — managed residential proxy s JS renderingem
// ---------------------------------------------------------------------------

async function fetchViaScraperApi(url: string, timeoutMs: number): Promise<string> {
  const apiUrl =
    `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}` +
    `&url=${encodeURIComponent(url)}&render=true`;

  const res = await fetch(apiUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`ScraperAPI HTTP ${res.status} pro ${url}`);
  }

  const html = await res.text();
  if (html.length < 500) {
    throw new Error(`ScraperAPI: příliš krátká odpověď (${html.length} B) pro ${url}`);
  }

  console.log(`[browser-fetch] ✓ ScraperAPI OK (${Math.round(html.length / 1024)} KB)`);
  return html;
}

// ---------------------------------------------------------------------------
// Puppeteer Stealth — headless Chrome s evasion
// ---------------------------------------------------------------------------

async function fetchViaPuppeteer(url: string, timeoutMs: number): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null;

  try {
    // Dynamický import — nevkládáme puppeteer do edge bundlu
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const puppeteer: any = (await import("puppeteer-extra")).default;
    const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;

    if (!stealthRegistered) {
      puppeteer.use(StealthPlugin());
      stealthRegistered = true;
    }

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? undefined,
      timeout: Math.min(timeoutMs, 30_000),
    });

    const page = await browser.newPage();

    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      "Accept-Language": "cs,en-US;q=0.9,en;q=0.8",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    });

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: Math.min(timeoutMs - 5_000, 30_000),
    });

    // Počkáme chvíli, aby se Next.js hydroval
    await new Promise<void>((resolve) => setTimeout(resolve, 1_500));

    const html = await page.content();
    if (html.length < 500) {
      throw new Error(`Puppeteer: prázdná stránka (${html.length} B)`);
    }

    console.log(`[browser-fetch] ✓ Puppeteer Stealth OK (${Math.round(html.length / 1024)} KB)`);
    return html;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[browser-fetch] Puppeteer selhal: ${msg}`);
    throw new Error("Detekován firewall Srealit, data nelze stáhnout.");
  } finally {
    if (browser) {
      await (browser as { close(): Promise<void> }).close().catch(() => {});
    }
  }
}
