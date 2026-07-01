import { NextRequest, NextResponse } from "next/server";
import { parseSearchQuery, filterByQuery } from "@/lib/ai-parser";
import { loadListings } from "@/lib/listings-store";

export async function POST(req: NextRequest) {
  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }

  const query = body.query?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "Dotaz je povinný." }, { status: 422 });
  }

  const parsed = await parseSearchQuery(query);
  const all = loadListings();
  const results = filterByQuery(all, parsed);

  // Seřadit podle skóre (sestupně), pak podle data
  const sorted = results.sort((a, b) => {
    const sa = a.score?.total ?? 0;
    const sb = b.score?.total ?? 0;
    if (sb !== sa) return sb - sa;
    return new Date(b.firstSeenAt).getTime() - new Date(a.firstSeenAt).getTime();
  });

  return NextResponse.json({
    query: parsed,
    total: sorted.length,
    results: sorted,
  });
}
