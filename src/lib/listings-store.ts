// MVP file-based store — náhrada za PostgreSQL listings tabulku.
// Nahradit Prisma + PostgreSQL při spuštění backendu (Fáze 2).
// Na Vercelu (serverless, read-only FS) je nutné použít reálnou DB.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { ScoreResult } from "./scoring";

const DATA_FILE = path.join(process.cwd(), ".data", "listings.json");

export interface StoredListing {
  id: string;
  source: string; // "sreality" | "bezrealitky" | ...
  sourceUrl: string;
  externalId: string;
  title: string;
  price: number;
  pricePerM2: number | null;
  disposition: string | null;
  usableArea: number | null;
  municipality: string | null;
  addressText: string | null;
  // Rozšířená pole (§6 spec)
  gpsLat: number | null;
  gpsLng: number | null;
  ownershipType: "OV" | "DV" | "OTHER" | null;
  condition: "NEW" | "GOOD" | "AVERAGE" | "BAD" | "RECONSTRUCTION" | null;
  energyLabel: string | null;
  floor: number | null;
  totalFloors: number | null;
  // Lokalitní data (z Golemio)
  metroWalkMinutes: number | null;
  mhdWalkMinutes: number | null;
  poiCount500m: number | null;
  // Scoring
  score: ScoreResult | null;
  confidenceScore: number; // 0–100, jak kompletní jsou data
  statusActive: boolean;
  /** true = metadata jsou pouze z URL slug, cenu/plochu je nutné ověřit */
  isPartial: boolean;
  firstSeenAt: string;
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

export function getListingById(id: string): StoredListing | null {
  return loadListings().find((l) => l.id === id) ?? null;
}

function persist(listings: StoredListing[]): void {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(listings, null, 2), "utf-8");
}

function calcConfidence(data: Partial<StoredListing>): number {
  let score = 0;
  if (data.price && data.price > 0) score += 20;
  if (data.pricePerM2) score += 15;
  if (data.usableArea) score += 15;
  if (data.disposition) score += 10;
  if (data.municipality) score += 10;
  if (data.gpsLat && data.gpsLng) score += 15;
  if (data.ownershipType) score += 5;
  if (data.condition) score += 5;
  if (data.energyLabel) score += 5;
  return Math.min(100, score);
}

export type UpsertInput = Omit<
  StoredListing,
  "id" | "firstSeenAt" | "lastSeenAt" | "statusActive" | "confidenceScore"
>;

export function upsertListing(data: UpsertInput): StoredListing {
  const listings = loadListings();
  const confidenceScore = calcConfidence(data);

  const existing = listings.find((l) => l.sourceUrl === data.sourceUrl);
  if (existing) {
    Object.assign(existing, {
      ...data,
      confidenceScore,
      lastSeenAt: new Date().toISOString(),
    });
    persist(listings);
    return existing;
  }

  const now = new Date().toISOString();
  const listing: StoredListing = {
    ...data,
    id: crypto.randomUUID(),
    statusActive: true,
    confidenceScore,
    isPartial: data.isPartial ?? false,
    firstSeenAt: now,
    lastSeenAt: now,
  };

  listings.unshift(listing);
  persist(listings);
  return listing;
}

export function deleteListingById(id: string): boolean {
  const listings = loadListings();
  const idx = listings.findIndex((l) => l.id === id);
  if (idx === -1) return false;
  listings.splice(idx, 1);
  persist(listings);
  return true;
}
