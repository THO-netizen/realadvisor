"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";

export interface WatchlistEntry {
  clientId: string;
  clientName: string;
  activeCount: number;
  matchesCount: number;
  lastActivity: string;
}

const PIPELINE_STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-600",
  sent: "bg-blue-600",
  interested: "bg-yellow-600",
  viewing: "bg-orange-600",
  rejected: "bg-red-700",
  archived: "bg-slate-800",
};

interface WatchlistSummaryProps {
  entries: WatchlistEntry[];
  pipelineStats: Record<string, number>;
  onNavigate?: (clientId: string) => void;
}

export function WatchlistSummary({
  entries,
  pipelineStats,
  onNavigate,
}: WatchlistSummaryProps) {
  const pipelineLabels: Record<string, string> = {
    new: "Nový",
    sent: "Posláno",
    interested: "Zájem",
    viewing: "Prohlídka",
    rejected: "Zamítnuto",
    archived: "Archiv",
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
          <Eye className="h-4 w-4 text-blue-400" />
          Hlídané poptávky
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pipeline přehled */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(pipelineLabels).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${PIPELINE_STATUS_COLORS[key]}`}
              />
              <span className="text-xs text-slate-400">{label}</span>
              <span className="text-xs font-bold text-white">
                {pipelineStats[key] ?? 0}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-800 pt-3 space-y-2">
          {entries.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-2">
              Žádní klienti s aktivními watchlisty.
            </p>
          ) : (
            entries.slice(0, 5).map((entry) => (
              <div
                key={entry.clientId}
                className="flex items-center justify-between"
              >
                <div>
                  <p className="text-sm text-white">{entry.clientName}</p>
                  <p className="text-xs text-slate-500">
                    {entry.activeCount} inzerátů ·{" "}
                    <span className="text-emerald-400">
                      {entry.matchesCount} nových shod
                    </span>
                  </p>
                </div>
                {onNavigate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigate(entry.clientId)}
                    className="h-6 text-xs text-slate-400 hover:text-white"
                  >
                    Otevřít
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
