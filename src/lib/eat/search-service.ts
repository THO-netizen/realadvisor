// EAT Search-by-spec
// 1. Parsuje přirozený jazyk (ai-parser.ts)
// 2. Filtruje + řadí dle skóre
// 3. Navrhuje import ze Sreality pokud < 3 výsledky

import { parseSearchQuery, filterByQuery } from "@/lib/ai-parser";
import { loadListings } from "@/lib/listings-store";
import type { EATSearchRequest, EATSearchResponse } from "./types";

const SUGGEST_IMPORT_THRESHOLD = 3;

export async function searchBySpec(
  req: EATSearchRequest
): Promise<EATSearchResponse> {
  const parsedQuery = await parseSearchQuery(req.query);
  const allListings = loadListings();
  const filtered = filterByQuery(allListings, parsedQuery);

  // Řadit: primárně dle score.total, sekundárně dle data přidání
  const sorted = filtered.sort((a, b) => {
    const sa = a.score?.total ?? 0;
    const sb = b.score?.total ?? 0;
    if (sb !== sa) return sb - sa;
    return (
      new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime()
    );
  });

  const maxResults = req.maxResults ?? 20;
  const results = sorted.slice(0, maxResults);

  return {
    parsedQuery,
    results,
    total: sorted.length,
    suggestImport: sorted.length < SUGGEST_IMPORT_THRESHOLD,
  };
}
