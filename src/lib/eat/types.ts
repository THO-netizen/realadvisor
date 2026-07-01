import type { StoredListing } from "@/lib/listings-store";
import type { ScoreResult } from "@/lib/scoring";
import type { LocalityStats } from "@/lib/stats";
import type { ParsedQuery } from "@/lib/ai-parser";

// ---------------------------------------------------------------------------
// Valuo tržní odhad
// ---------------------------------------------------------------------------
export interface ValuoEstimate {
  estimatedValue: number | null;
  confidence: "high" | "medium" | "low";
  deviationPct: number | null;   // záporné = nabídka DRAŽŠÍ než odhad
  rangeLow: number | null;
  rangeHigh: number | null;
  source: "valuo" | "mock";
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// RÚIAN adresní ověření
// ---------------------------------------------------------------------------
export interface RUIANResult {
  found: boolean;
  ruianId: string | null;
  officialAddress: string | null;
  municipality: string | null;
  district: string | null;
  postalCode: string | null;
  parcelId: string | null;
  lat: number | null;
  lng: number | null;
  source: "ruian" | "nominatim" | "mock";
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// EAT Report (uložený výsledek analýzy)
// ---------------------------------------------------------------------------
export interface EATReport {
  id: string;
  createdAt: string;
  sourceUrl: string;
  clientName: string | null;
  advisorNotes: string | null;
  listing: StoredListing;
  score: ScoreResult | null;
  localityStats: LocalityStats | null;
  valuoEstimate: ValuoEstimate;
  ruian: RUIANResult;
  status: "complete" | "partial" | "failed";
  error: string | null;
}

// ---------------------------------------------------------------------------
// API požadavky/odpovědi
// ---------------------------------------------------------------------------
export interface EATSearchRequest {
  query: string;
  maxResults?: number;
}

export interface EATSearchResponse {
  parsedQuery: ParsedQuery;
  results: StoredListing[];
  total: number;
  suggestImport: boolean;
}

export interface EATAnalyzeRequest {
  url: string;
  clientName?: string;
  advisorNotes?: string;
}

export interface EATAnalyzeResponse {
  reportId: string;
  report: EATReport;
}
