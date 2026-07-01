import { type NextRequest, NextResponse } from "next/server";
import { getReportById } from "@/lib/eat/report-store";
import { generateReport } from "@/lib/eat/pdf-generator";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  const { reportId } = await params;
  const report = getReportById(reportId);

  if (!report) {
    return NextResponse.json({ error: "Report nenalezen." }, { status: 404 });
  }

  try {
    const pdfBuffer = await generateReport(report);
    const safeTitle = report.listing.title
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .trim()
      .slice(0, 60)
      .replace(/\s+/g, "_");
    const filename = `RealAdvisor_Report_${safeTitle}_${report.id.slice(0, 8)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Chyba generování PDF.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
