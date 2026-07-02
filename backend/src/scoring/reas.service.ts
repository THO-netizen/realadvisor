import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import axios, { isAxiosError } from "axios";
import * as cheerio from "cheerio";

// ---------------------------------------------------------------------------
// Národní cenová pásma — nouzový fallback, pokud Reas není dostupný
// Zdroj: ČNB, Deloitte Real Index, ČSÚ (aktualizace ~1× ročně)
// ---------------------------------------------------------------------------

const NATIONAL_PRICE_BANDS: ReadonlyArray<[string, number]> = [
  ["Praha 1",             165_000],
  ["Praha 2",             148_000],
  ["Praha 6",             132_000],
  ["Praha 7",             128_000],
  ["Praha 5",             122_000],
  ["Praha 3",             120_000],
  ["Praha 8",             115_000],
  ["Praha 10",            108_000],
  ["Praha 4",             112_000],
  ["Praha 9",             105_000],
  ["Praha 11",             95_000],
  ["Praha 12",             92_000],
  ["Praha 13",             90_000],
  ["Praha 14",             88_000],
  ["Praha 15",             85_000],
  ["Praha",               120_000],
  ["Brno-střed",           98_000],
  ["Brno",                 78_000],
  ["Ostrava",              40_000],
  ["Plzeň",                62_000],
  ["Liberec",              48_000],
  ["Olomouc",              55_000],
  ["Pardubice",            58_000],
  ["Hradec Králové",       60_000],
  ["České Budějovice",     57_000],
  ["Zlín",                 47_000],
  ["Ústí nad Labem",       28_000],
  ["Jihlava",              52_000],
  ["Kladno",               52_000],
  ["Karviná",              25_000],
  ["Teplice",              30_000],
  ["Opava",                38_000],
  ["Frýdek-Místek",        42_000],
  ["Most",                 22_000],
];

const REAS_BASE = "https://www.reas.cz";
const REAS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// Typy
// ---------------------------------------------------------------------------

export interface ReasMarketData {
  medianPricePerM2: number;
  confidence: "high" | "medium" | "low";
  source: "reas_api" | "national_fallback";
  municipality: string;
  fetchedAt: string;
}

export interface ReasRequestParams {
  lat: number | null;
  lng: number | null;
  municipality: string | null;
  disposition: string | null;
  usableAreaM2: number | null;
}

// ---------------------------------------------------------------------------
// Cache (6 h TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: ReasMarketData;
  expiresAt: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ReasService implements OnModuleInit {
  private readonly logger = new Logger(ReasService.name);
  private readonly cache = new Map<string, CacheEntry>();

  onModuleInit(): void {
    this.logger.log(
      "ReasService inicializován. Cenová data: Reas.cz cenová mapa → národní pásma fallback.",
    );
  }

  /**
   * Vrátí tržní data pro danou nemovitost.
   * Pořadí: Reas.cz cenová mapa → národní cenová pásma.
   * Nikdy nevyhazuje výjimku.
   */
  async getMarketData(params: ReasRequestParams): Promise<ReasMarketData | null> {
    const muni = params.municipality;
    if (!muni) return null;

    const cacheKey = `${muni}|${params.lat?.toFixed(3) ?? ""}|${params.lng?.toFixed(3) ?? ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.log(`Reas cache hit pro: ${muni} → ${cached.data.medianPricePerM2} Kč/m²`);
      return cached.data;
    }

    this.logger.log(`Calling Reas cenová mapa for municipality: ${muni}`);

    const reas = await this.fetchFromReas(muni, params.lat, params.lng);
    if (reas) {
      this.cache.set(cacheKey, { data: reas, expiresAt: Date.now() + CACHE_TTL_MS });
      return reas;
    }

    // Fallback na národní pásma
    const fallback = this.nationalFallback(muni);
    if (fallback) {
      this.logger.warn(
        `Reas nedostupný pro "${muni}" — použit národní fallback: ${fallback.medianPricePerM2} Kč/m²`,
      );
      this.cache.set(cacheKey, { data: fallback, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return fallback;
  }

  // ---------------------------------------------------------------------------
  // Scraping Reas cenová mapa
  // ---------------------------------------------------------------------------

  private async fetchFromReas(
    municipality: string,
    lat: number | null,
    lng: number | null,
  ): Promise<ReasMarketData | null> {
    // Pokus 1: JSON API endpoint
    // Přesnou cestu ověřte přes DevTools na https://www.reas.cz/cenovamapa/
    // (Network tab → Fetch/XHR → po zadání obce hledejte JSON požadavek s cenami)
    const apiResult = await this.tryReasApi(municipality, lat, lng);
    if (apiResult) return apiResult;

    // Pokus 2: HTML scraping cenové mapy
    const htmlResult = await this.tryReasHtml(municipality);
    if (htmlResult) return htmlResult;

    return null;
  }

  private async tryReasApi(
    municipality: string,
    lat: number | null,
    lng: number | null,
  ): Promise<ReasMarketData | null> {
    // Kandidátní API endpointy — Reas může používat různé vzory
    const endpoints = [
      `${REAS_BASE}/api/v1/price-map?municipality=${encodeURIComponent(municipality)}&type=apartment`,
      `${REAS_BASE}/api/cenovamapa/data?q=${encodeURIComponent(municipality)}`,
      lat && lng
        ? `${REAS_BASE}/api/v1/price-map?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}&radius=2000`
        : null,
    ].filter(Boolean) as string[];

    for (const url of endpoints) {
      try {
        this.logger.log(`Calling Reas API: ${url}`);
        const { data } = await axios.get<Record<string, unknown>>(url, {
          headers: {
            "User-Agent": REAS_UA,
            Accept: "application/json",
            Referer: `${REAS_BASE}/cenovamapa/`,
          },
          timeout: 8_000,
        });

        const median = this.extractMedian(data);
        if (median && median > 0) {
          this.logger.log(`Reas API OK (${url}): medianPricePerM2=${median}`);
          return {
            medianPricePerM2: Math.round(median),
            confidence: "high",
            source: "reas_api",
            municipality,
            fetchedAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        if (isAxiosError(err)) {
          this.logger.warn(
            `Reas API (${url}): HTTP ${err.response?.status ?? "N/A"} — ${JSON.stringify(err.response?.data ?? err.message)}`,
          );
        }
        // Pokračujeme na další endpoint
      }
    }

    return null;
  }

  private async tryReasHtml(municipality: string): Promise<ReasMarketData | null> {
    const url = `${REAS_BASE}/cenovamapa/?q=${encodeURIComponent(municipality)}`;
    this.logger.log(`Calling Reas HTML (cenová mapa): ${url}`);

    try {
      const { data: html } = await axios.get<string>(url, {
        headers: {
          "User-Agent": REAS_UA,
          Accept: "text/html,application/xhtml+xml",
          Referer: "https://www.google.com/",
        },
        timeout: 10_000,
      });

      const $ = cheerio.load(html);

      // Pokus o extrakci ceny z typických CSS tříd cenové mapy
      // Upravte selektory po inspekci DOM na https://www.reas.cz/cenovamapa/
      const priceSelectors = [
        "[data-price-per-m2]",
        "[data-median-price]",
        ".price-per-m2",
        ".median-price",
        ".price-map__median",
        ".price-map-value",
        "#median-price",
      ];

      for (const sel of priceSelectors) {
        const el = $(sel).first();
        if (!el.length) continue;

        const raw = el.attr("data-price-per-m2") ?? el.attr("data-median-price") ?? el.text();
        const price = parseInt(raw.replace(/\D/g, ""), 10);
        if (price > 5_000 && price < 500_000) {
          this.logger.log(`Reas HTML OK (selektor: ${sel}): medianPricePerM2=${price}`);
          return {
            medianPricePerM2: price,
            confidence: "medium",
            source: "reas_api",
            municipality,
            fetchedAt: new Date().toISOString(),
          };
        }
      }

      // Fallback: regex na číselnou hodnotu Kč/m² v textu stránky
      const text = $.text();
      const match = text.match(/(\d[\d\s]{2,})\s*(?:Kč\/m[²2]|Kc\/m2|kc\/m2)/i);
      if (match) {
        const price = parseInt(match[1].replace(/\s/g, ""), 10);
        if (price > 5_000 && price < 500_000) {
          this.logger.log(`Reas HTML regex OK: medianPricePerM2=${price}`);
          return {
            medianPricePerM2: price,
            confidence: "medium",
            source: "reas_api",
            municipality,
            fetchedAt: new Date().toISOString(),
          };
        }
      }

      this.logger.warn(`Reas HTML: cena nenalezena na stránce pro "${municipality}"`);
      return null;
    } catch (err) {
      if (isAxiosError(err)) {
        this.logger.warn(
          `Reas HTML (${url}): HTTP ${err.response?.status ?? "N/A"} — ${JSON.stringify(err.response?.data ?? err.message)}`,
        );
      } else {
        this.logger.warn(`Reas HTML selhal: ${(err as Error).message}`);
      }
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Pomocné metody
  // ---------------------------------------------------------------------------

  private extractMedian(data: Record<string, unknown>): number | null {
    // Reas může vracet různé klíče — zkusíme obvyklé varianty
    const payload = (data["data"] ?? data["result"] ?? data["priceMap"] ?? data) as Record<string, unknown>;
    const val =
      payload["medianPricePerM2"] ??
      payload["median_price_per_m2"] ??
      payload["median"] ??
      payload["medianPrice"] ??
      payload["price_per_m2"] ??
      payload["pricePerM2"];

    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const n = parseFloat(val.replace(/\s/g, ""));
      return isNaN(n) ? null : n;
    }
    return null;
  }

  private nationalFallback(municipality: string): ReasMarketData | null {
    const mLower = municipality.toLowerCase();
    let best: [string, number] | null = null;
    for (const [name, price] of NATIONAL_PRICE_BANDS) {
      if (mLower.includes(name.toLowerCase())) {
        if (!best || name.length > best[0].length) best = [name, price];
      }
    }
    if (!best) return null;
    return {
      medianPricePerM2: best[1],
      confidence: "medium",
      source: "national_fallback",
      municipality,
      fetchedAt: new Date().toISOString(),
    };
  }
}
