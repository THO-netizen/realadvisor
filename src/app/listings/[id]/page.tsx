import { notFound } from "next/navigation";
import Link from "next/link";
import { getListingById } from "@/lib/listings-store";
import { loadListings } from "@/lib/listings-store";
import { calcLocalityStats } from "@/lib/stats";
import { ArrowLeft, ExternalLink, MapPin, Train, AlertTriangle, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function formatPrice(p: number): string {
  return p.toLocaleString("cs-CZ") + " Kč";
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const widthCls =
    color === "emerald"
      ? "bg-emerald-500"
      : color === "green"
      ? "bg-green-500"
      : color === "yellow"
      ? "bg-yellow-500"
      : color === "orange"
      ? "bg-orange-500"
      : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-white">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${widthCls}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function scoreColor(n: number): string {
  if (n >= 80) return "emerald";
  if (n >= 60) return "green";
  if (n >= 40) return "yellow";
  if (n >= 20) return "orange";
  return "red";
}

const FLAG_LABELS: Record<string, string> = {
  COOPERATIVE_OWNERSHIP: "Družstevní vlastnictví (−15 b.)",
  PRICE_ABOVE_MARKET_30PCT: "Cena >30 % nad mediánem (−20 b.)",
  MISSING_GPS: "Chybí GPS souřadnice (−10 b.)",
  GROUND_FLOOR_OR_BASEMENT: "Přízemí nebo suterén (−8 b.)",
  POOR_ENERGY_LABEL: "Nízká energetická třída E–G (−10 b.)",
  LEGAL_ISSUE_DETECTED: "Detekován právní problém (−20 b.)",
  AUCTION: "Dražba (−15 b.)",
  VERY_SHORT_DESCRIPTION: "Velmi krátký popis (−5 b.)",
  STEEP_PRICE_DROP: "Prudký pokles ceny >15 % za 30 dní (−8 b.)",
};

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;
  const listing = getListingById(id);

  if (!listing) notFound();

  const score = listing.score;
  const allListings = loadListings();
  const localityStats = listing.municipality
    ? calcLocalityStats(listing.municipality, allListings)
    : null;

  const totalColor = score ? scoreColor(score.total) : "slate";
  const totalColorCls =
    totalColor === "emerald"
      ? "text-emerald-400"
      : totalColor === "green"
      ? "text-green-400"
      : totalColor === "yellow"
      ? "text-yellow-400"
      : totalColor === "orange"
      ? "text-orange-400"
      : totalColor === "red"
      ? "text-red-400"
      : "text-slate-400";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-sm text-slate-400 truncate max-w-xs">{listing.title}</span>
      </div>

      {/* Hlavička */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-white">{listing.title}</h1>
          {listing.addressText && (
            <p className="flex items-center gap-1 text-sm text-slate-400">
              <MapPin className="h-3.5 w-3.5" />
              {listing.addressText}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {listing.ownershipType && (
              <span className="text-[11px] bg-slate-800 text-slate-300 rounded px-2 py-0.5">
                {listing.ownershipType}
              </span>
            )}
            {listing.condition && (
              <span className="text-[11px] bg-slate-800 text-slate-300 rounded px-2 py-0.5">
                {listing.condition}
              </span>
            )}
            {listing.energyLabel && (
              <span className="text-[11px] bg-slate-800 text-slate-300 rounded px-2 py-0.5">
                Energie {listing.energyLabel}
              </span>
            )}
            {listing.floor !== null && (
              <span className="text-[11px] bg-slate-800 text-slate-300 rounded px-2 py-0.5">
                {listing.floor}. podlaží{listing.totalFloors ? ` / ${listing.totalFloors}` : ""}
              </span>
            )}
            {listing.isPartial && (
              <span className="text-[11px] bg-yellow-950 text-yellow-400 border border-yellow-800 rounded px-2 py-0.5">
                Nekompletní data — ověřte v originálu
              </span>
            )}
          </div>
        </div>

        <a
          href={listing.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
        >
          <ExternalLink className="h-4 w-4" />
          Otevřít originál
        </a>
      </div>

      {/* Cenový panel */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500">Cena</p>
          <p className="text-xl font-bold text-white">
            {listing.price > 0 ? formatPrice(listing.price) : "—"}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500">Cena / m²</p>
          <p className="text-xl font-bold text-white">
            {listing.pricePerM2
              ? listing.pricePerM2.toLocaleString("cs-CZ") + " Kč"
              : "—"}
          </p>
          {localityStats?.medianPricePerM2 && listing.pricePerM2 && (
            <p className="text-xs text-slate-500">
              Median lokality:{" "}
              {localityStats.medianPricePerM2.toLocaleString("cs-CZ")} Kč/m²
            </p>
          )}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <p className="text-xs text-slate-500">Plocha</p>
          <p className="text-xl font-bold text-white">
            {listing.usableArea ? `${listing.usableArea} m²` : "—"}
          </p>
          {listing.disposition && (
            <p className="text-xs text-slate-500">{listing.disposition}</p>
          )}
        </div>
      </div>

      {/* Skóre + MHD */}
      <div className="grid grid-cols-2 gap-4">
        {/* Lokalitní skóre */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Lokalitní skóre</h2>
            {score && (
              <div className="flex flex-col items-end">
                <span className={`text-3xl font-bold ${totalColorCls}`}>
                  {score.total}
                </span>
                <span className="text-[11px] text-slate-500">{score.label}</span>
              </div>
            )}
          </div>

          {score ? (
            <div className="space-y-3">
              <ScoreBar label="Cena (30 %)" value={score.price} color={scoreColor(score.price)} />
              <ScoreBar label="Lokalita (25 %)" value={score.location} color={scoreColor(score.location)} />
              <ScoreBar label="Hypotéka (20 %)" value={score.mortgage} color={scoreColor(score.mortgage)} />
              <ScoreBar label="Růst (15 %)" value={score.growth} color={scoreColor(score.growth)} />
              <ScoreBar label="Likvidita (10 %)" value={score.liquidity} color={scoreColor(score.liquidity)} />

              {score.priceVsMedianPct !== null && (
                <p className="text-xs text-slate-500 pt-1">
                  Cena vs. median lokality:{" "}
                  <span
                    className={
                      score.priceVsMedianPct > 0 ? "text-red-400" : "text-emerald-400"
                    }
                  >
                    {score.priceVsMedianPct > 0 ? "+" : ""}
                    {score.priceVsMedianPct} %
                  </span>
                </p>
              )}

              {score.penalty > 0 && (
                <div className="pt-2 border-t border-slate-800">
                  <p className="text-xs text-slate-500 mb-2">
                    Celková penalizace: −{score.penalty} b.
                  </p>
                  <div className="space-y-1">
                    {score.flags.map((flag) => (
                      <div
                        key={flag}
                        className="flex items-center gap-1.5 text-[11px] text-orange-400"
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {FLAG_LABELS[flag] ?? flag}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {score.penalty === 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 pt-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Žádné rizikové faktory
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Skóre není dostupné.</p>
          )}
        </div>

        {/* Doprava */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Train className="h-4 w-4 text-slate-400" />
            Dostupnost MHD
          </h2>

          <div className="space-y-3">
            {listing.metroWalkMinutes !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Metro</span>
                <span className="text-sm font-medium text-white">
                  {listing.metroWalkMinutes} min chůze
                </span>
              </div>
            )}
            {listing.mhdWalkMinutes !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Nejbližší MHD</span>
                <span className="text-sm font-medium text-white">
                  {listing.mhdWalkMinutes} min chůze
                </span>
              </div>
            )}
            {listing.metroWalkMinutes === null && listing.mhdWalkMinutes === null && (
              <p className="text-sm text-slate-500">
                {listing.gpsLat
                  ? "Data MHD nejsou dostupná (Golemio API klíč není nastaven)."
                  : "GPS souřadnice nejsou k dispozici — data MHD nelze načíst."}
              </p>
            )}
          </div>

          {listing.gpsLat && listing.gpsLng && (
            <div className="pt-3 border-t border-slate-800">
              <p className="text-xs text-slate-600">
                GPS: {listing.gpsLat.toFixed(5)}, {listing.gpsLng.toFixed(5)}
              </p>
              <a
                href={`https://mapy.cz/zakladni?x=${listing.gpsLng}&y=${listing.gpsLat}&z=16`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-flex items-center gap-1"
              >
                Zobrazit na mapě <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Technické informace</h2>
        <div className="grid grid-cols-3 gap-x-8 gap-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Zdroj</span>
            <span className="text-slate-300">{listing.source}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">ID</span>
            <span className="text-slate-300 font-mono text-xs">{listing.externalId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Confidence</span>
            <span className="text-slate-300">{listing.confidenceScore} %</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Přidáno</span>
            <span className="text-slate-300">
              {new Date(listing.firstSeenAt).toLocaleDateString("cs-CZ")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Aktualizováno</span>
            <span className="text-slate-300">
              {new Date(listing.lastSeenAt).toLocaleDateString("cs-CZ")}
            </span>
          </div>
          {localityStats?.count !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-500">Inzerátů v lokalitě</span>
              <span className="text-slate-300">{localityStats.count}</span>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-600 border-t border-slate-800 pt-4">
        RealAdvisor zobrazuje pouze metadata inzerátu. Fotografie ani celý text nejsou ukládány.
        Poradce je povinen ověřit aktuální stav na zdrojovém portálu.
      </p>
    </div>
  );
}
