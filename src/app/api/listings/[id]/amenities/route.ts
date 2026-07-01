import { type NextRequest, NextResponse } from "next/server";
import { getListingById } from "@/lib/listings-store";
import { getTransitData } from "@/lib/golemio";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listing = getListingById(id);

  if (!listing) {
    return NextResponse.json({ error: "Inzerát nenalezen." }, { status: 404 });
  }

  if (!listing.gpsLat || !listing.gpsLng) {
    return NextResponse.json(
      { stops: [], source: "none", reason: "Inzerát nemá GPS souřadnice." },
      { status: 200 }
    );
  }

  try {
    const transit = await getTransitData(listing.gpsLat, listing.gpsLng);
    return NextResponse.json({
      stops: transit.stops,
      source: transit.source,
      nearestMetroMinutes: transit.nearestMetroMinutes,
      nearestMhdMinutes: transit.nearestMhdMinutes,
    });
  } catch {
    return NextResponse.json({ stops: [], source: "error" }, { status: 200 });
  }
}
