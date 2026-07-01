import { NextRequest, NextResponse } from "next/server";
import { analyzeUrl } from "@/lib/eat/analysis-service";
import type { EATAnalyzeRequest } from "@/lib/eat/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: EATAnalyzeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }

  const url = body.url?.trim() ?? "";
  if (!url) {
    return NextResponse.json({ error: "URL je povinná." }, { status: 422 });
  }

  try {
    const result = await analyzeUrl({
      url,
      clientName: body.clientName,
      advisorNotes: body.advisorNotes,
    });
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Neznámá chyba při analýze.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
