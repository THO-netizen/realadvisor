"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, TrendingDown, MapPin, Home, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";

const QUICK_FILTERS = [
  {
    label: "Pod cenou trhu",
    icon: TrendingDown,
    description: "Inzeráty >10% pod mediánem lokality",
    params: "priceVsMedian=below10",
    color: "text-emerald-400 border-emerald-800 hover:border-emerald-600",
  },
  {
    label: "Blízko metra",
    icon: MapPin,
    description: "Vzdálenost k metru < 5 minut pěšky",
    params: "metroWalkMax=5",
    color: "text-blue-400 border-blue-800 hover:border-blue-600",
  },
  {
    label: "Osobní vlastnictví",
    icon: Home,
    description: "Pouze OV — vhodné pro hypotéku",
    params: "ownershipType=OV",
    color: "text-sky-400 border-sky-800 hover:border-sky-600",
  },
  {
    label: "Vhodné pro hypotéku",
    icon: Building2,
    description: "Vysoké hypoteční skóre (>70)",
    params: "mortgageScoreMin=70",
    color: "text-violet-400 border-violet-800 hover:border-violet-600",
  },
];

export function QuickFilters() {
  const router = useRouter();

  const handleFilter = (params: string) => {
    router.push(`/search?${params}`);
  };

  return (
    <Card className="bg-slate-900 border-slate-800 col-span-2">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-400" />
          Rychlé filtry
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_FILTERS.map((filter) => (
            <Button
              key={filter.label}
              variant="outline"
              className={`h-auto py-3 px-4 flex flex-col items-start gap-1 bg-slate-800/50 border ${filter.color} transition-all`}
              onClick={() => handleFilter(filter.params)}
            >
              <div className="flex items-center gap-2">
                <filter.icon className="h-4 w-4" />
                <span className="font-semibold text-white text-sm">
                  {filter.label}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-normal text-left">
                {filter.description}
              </span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
