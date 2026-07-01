import { Clock } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { TopOpportunities } from "@/components/dashboard/TopOpportunities";
import { PriceAlarms } from "@/components/dashboard/PriceAlarms";
import { WatchlistSummary } from "@/components/dashboard/WatchlistSummary";
import { QuickFilters } from "@/components/dashboard/QuickFilters";
import { ImportSection } from "@/components/dashboard/ImportSection";
import { ClientSearch } from "@/components/dashboard/ClientSearch";
import { getDashboardStats } from "@/lib/dashboard-data";
import { loadListings } from "@/lib/listings-store";

// Nerevalidovat automaticky — stránka se refreshuje přes router.refresh() po importu
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, listings] = await Promise.all([
    getDashboardStats(process.env.NEXT_PUBLIC_API_URL ?? ""),
    Promise.resolve(loadListings()),
  ]);

  const totalWatchlistActive = stats.watchlistEntries.reduce(
    (sum, e) => sum + e.activeCount,
    0
  );

  const newListingsToday = listings.filter((l) => {
    const diff = Date.now() - new Date(l.firstSeenAt).getTime();
    return diff < 86_400_000;
  }).length;

  return (
    <div className="space-y-6">
      {/* Hlavička */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            {new Date().toLocaleDateString("cs-CZ", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
          <Clock className="h-3 w-3" />
          Aktualizováno{" "}
          {new Date().toLocaleTimeString("cs-CZ", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>

      {/* Statistické karty */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Nové nabídky dnes"
          value={newListingsToday}
          description={
            listings.length > 0
              ? `${listings.length} inzerátů celkem`
              : "Zatím žádné importované inzeráty"
          }
          icon="building2"
          actionLabel="Zobrazit seznam"
          accentColor="blue"
        />
        <StatCard
          title="Top příležitosti"
          value={stats.topListings.length}
          description="Inzeráty se skóre ≥ 70 přidané tento týden"
          icon="trending-up"
          accentColor="green"
        />
        <StatCard
          title="Cenové alarmy"
          value={stats.priceAlarms.length}
          description="Pokles ceny > 5 % od posledního záznamu"
          icon="bell"
          accentColor="yellow"
        />
        <StatCard
          title="Aktivní watchlisty"
          value={totalWatchlistActive}
          description={`${stats.watchlistEntries.length} klientů se sledovanými nabídkami`}
          icon="eye"
          accentColor="blue"
        />
      </div>

      {/* Import inzerátů */}
      <ImportSection initialListings={listings} />

      {/* Vyhledávání pro klienta */}
      <ClientSearch />

      {/* Původní widgety (připraveny pro napojení na backend) */}
      <div className="grid grid-cols-3 gap-4">
        <TopOpportunities listings={stats.topListings} />
        <PriceAlarms alarms={stats.priceAlarms} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <QuickFilters />
        <WatchlistSummary
          entries={stats.watchlistEntries}
          pipelineStats={stats.pipelineStats}
        />
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-slate-600 border-t border-slate-800 pt-4">
        Data jsou orientační. Poradce je povinen ověřit aktuální stav na
        zdrojovém portálu. RealAdvisor neukládá fotografie ani celé texty
        inzerátů.
      </p>
    </div>
  );
}
