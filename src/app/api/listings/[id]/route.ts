import { NextRequest, NextResponse } from "next/server";
import { getListingById, deleteListingById } from "@/lib/listings-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const listing = getListingById(id);
  if (!listing) {
    return NextResponse.json({ error: "Inzerát nenalezen." }, { status: 404 });
  }
  return NextResponse.json(listing);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deleted = deleteListingById(id);
  if (!deleted) {
    return NextResponse.json({ error: "Inzerát nenalezen." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
