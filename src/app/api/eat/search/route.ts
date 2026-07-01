import { NextRequest, NextResponse } from "next/server";
import { searchBySpec } from "@/lib/eat/search-service";
import type { EATSearchRequest } from "@/lib/eat/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: EATSearchRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }

  const query = body.query?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "Dotaz je povinný." }, { status: 422 });
  }

  try {
    const result = await searchBySpec({ query, maxResults: body.maxResults });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Neznámá chyba.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
