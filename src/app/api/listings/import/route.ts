import { NextRequest, NextResponse } from "next/server";
import { validateSrealityUrl, fetchSrealityMetadata } from "@/lib/sreality";
import { isAllowedByRobots } from "@/lib/robots-checker";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { upsertListing } from "@/lib/listings-store";

export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neplatné tělo požadavku." }, { status: 400 });
  }

  const rawUrl = body.url?.trim() ?? "";

  // 1. Validace URL
  const validation = validateSrealityUrl(rawUrl);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  // 2. Kontrola robots.txt — pro ruční jednorázový import neblokujeme,
  //    ale zaznamenáme varování. Automatické konektory (Fáze 2) musí robots.txt
  //    respektovat přísně. Viz spec §2 compliance checklist.
  const robotsAllowed = await isAllowedByRobots(rawUrl);

  // 3. Rate limit: max 1 požadavek / 2 sekundy na doménu
  await enforceRateLimit("sreality.cz");

  // 4. Stažení metadat
  let metadata;
  try {
    metadata = await fetchSrealityMetadata(rawUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Neznámá chyba při stahování metadat.";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // 5. Uložení do store (MVP: JSON soubor; produkce: Prisma + PostgreSQL)
  const listing = upsertListing({
    source: "sreality",
    sourceUrl: metadata.sourceUrl,
    externalId: metadata.externalId,
    title: metadata.title,
    price: metadata.price,
    pricePerM2: metadata.pricePerM2,
    disposition: metadata.disposition,
    usableArea: metadata.usableArea,
    municipality: metadata.municipality,
    addressText: metadata.addressText,
    isPartial: metadata.isPartial,
  });

  return NextResponse.json({
    listing,
    robotsWarning: !robotsAllowed
      ? "robots.txt portálu omezuje automatický přístup. Tento ruční import je povolen, ale pro pravidelné stahování dat kontaktujte Sreality pro partnerský feed."
      : null,
  }, { status: 200 });
}
