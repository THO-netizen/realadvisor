import { NextResponse } from "next/server";
import { testReasConnection } from "@/lib/reas-service";

// GET /api/reas/test?municipality=Praha
// Diagnostický endpoint — ověří dostupnost Reas.cz cenové mapy a vrátí cenu.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const municipality = searchParams.get("municipality") ?? "Praha";

  const result = await testReasConnection(municipality);

  if (!result.ok) {
    return NextResponse.json(result, { status: 503 });
  }

  return NextResponse.json(result);
}
