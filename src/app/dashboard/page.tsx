import { ImportSection } from "@/components/dashboard/ImportSection";
import { EATPanel } from "@/components/dashboard/EATPanel";
import { loadListings } from "@/lib/listings-store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const listings = loadListings();

  return (
    <div className="space-y-6">
      <ImportSection initialListings={listings} />
      <EATPanel />
      <p className="text-xs text-slate-600 border-t border-slate-800 pt-4">
        Data jsou orientační. Poradce je povinen ověřit aktuální stav na
        zdrojovém portálu. RealAdvisor neukládá fotografie ani celé texty
        inzerátů.
      </p>
    </div>
  );
}
