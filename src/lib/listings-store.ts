// MVP file-based store — náhrada za PostgreSQL listings tabulku.
// Nahradit Prisma + PostgreSQL při spuštění backendu (Fáze 1 → Fáze 2).
// Na Vercelu (serverless, read-only FS) je nutné použít reálnou DB.

import fs from "fs";
import path from "path";
import crypto from "crypto";

const DATA_FILE = path.join(process.cwd(), ".data", "listings.json");

export interface StoredListing {
  id: string;
  source: string; // "sreality" | "bezrealitky" | ...
  sourceUrl: string;
  externalId: string;
  title: string;
  price: number; // celá Kč
  pricePerM2: number | null;
  disposition: string | null;
  usableArea: number | null;
  municipality: string | null;
  addressText: string | null;
  statusActive: boolean;
  /** true = metadata jsou pouze z URL slug, cenu/plochu je nutné ověřit */
  isPartial: boolean;
  firstSeenAt: string; // ISO timestamp
  lastSeenAt: string;
}

function ensureDir(): void {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadListings(): StoredListing[] {
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as StoredListing[];
  } catch {
    return [];
  }
}

function persist(listings: StoredListing[]): void {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(listings, null, 2), "utf-8");
}

export function upsertListing(
  data: Omit<StoredListing, "id" | "firstSeenAt" | "lastSeenAt" | "statusActive">
): StoredListing {
  const listings = loadListings();

  // Deduplicita podle sourceUrl
  const existing = listings.find((l) => l.sourceUrl === data.sourceUrl);
  if (existing) {
    existing.price = data.price;
    existing.pricePerM2 = data.pricePerM2;
    existing.lastSeenAt = new Date().toISOString();
    persist(listings);
    return existing;
  }

  const now = new Date().toISOString();
  const listing: StoredListing = {
    ...data,
    id: crypto.randomUUID(),
    statusActive: true,
    isPartial: data.isPartial ?? false,
    firstSeenAt: now,
    lastSeenAt: now,
  };

  // Nejnovější nahoře
  listings.unshift(listing);
  persist(listings);
  return listing;
}
