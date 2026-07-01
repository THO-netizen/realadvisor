import { NextRequest, NextResponse } from "next/server";
import { importFromUrl } from "@/lib/import-service";

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }

  const rawUrl = body.url?.trim() ?? "";
  if (!rawUrl) {
    return NextResponse.json({ error: "URL je povinné pole." }, { status: 422 });
  }

  try {
    const result = await importFromUrl(rawUrl);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Neznámá chyba při importu.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
