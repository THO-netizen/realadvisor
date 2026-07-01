"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp } from "lucide-react";

export interface Listing {
  id: string;
  title: string;
  price: number;
  pricePerM2: number;
  disposition: string;
  area: number;
  municipality: string;
  totalScore: number;
  source: string;
  sourceUrl: string;
  priceVsMedianPct: number | null;
  ownershipType: "OV" | "DV" | "OTHER";
  addedDaysAgo: number;
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
        {score}
      </span>
    );
  if (score >= 60)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-green-300">
        <span className="h-2 w-2 rounded-full bg-green-300 inline-block" />
        {score}
      </span>
    );
  if (score >= 40)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-yellow-400">
        <span className="h-2 w-2 rounded-full bg-yellow-400 inline-block" />
        {score}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400">
      <span className="h-2 w-2 rounded-full bg-red-400 inline-block" />
      {score}
    </span>
  );
}

interface TopOpportunitiesProps {
  listings: Listing[];
  onViewAll?: () => void;
}

export function TopOpportunities({
  listings,
  onViewAll,
}: TopOpportunitiesProps) {
  return (
    <Card className="bg-slate-900 border-slate-800 col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          Top příležitosti tento týden
        </CardTitle>
        {onViewAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="text-xs text-slate-400 hover:text-white h-7"
          >
            Zobrazit vše
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {listings.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">
            Žádné inzeráty zatím nebyly přidány.
          </p>
        ) : (
          listings.map((listing) => (
            <div
              key={listing.id}
              className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <ScoreBadge score={listing.totalScore} />
                  <Badge
                    variant="outline"
                    className="text-[10px] border-slate-700 text-slate-400 py-0"
                  >
                    {listing.source}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0 ${
                      listing.ownershipType === "OV"
                        ? "border-emerald-800 text-emerald-400"
                        : "border-yellow-800 text-yellow-400"
                    }`}
                  >
                    {listing.ownershipType}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-white truncate">
                  {listing.disposition} · {listing.area} m² ·{" "}
                  {listing.municipality}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-sm text-slate-300 font-semibold">
                    {listing.price.toLocaleString("cs-CZ")} Kč
                  </span>
                  <span className="text-xs text-slate-500">
                    {listing.pricePerM2.toLocaleString("cs-CZ")} Kč/m²
                  </span>
                  {listing.priceVsMedianPct !== null && (
                    <span
                      className={`text-xs font-medium ${
                        listing.priceVsMedianPct < 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {listing.priceVsMedianPct > 0 ? "+" : ""}
                      {listing.priceVsMedianPct}% vs. medián
                    </span>
                  )}
                </div>
              </div>
              <a
                href={listing.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 p-2 rounded-md text-slate-500 hover:text-white hover:bg-slate-700 transition-colors opacity-0 group-hover:opacity-100"
                title="Otevřít originál"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
