"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, TrendingDown, ExternalLink } from "lucide-react";

export interface PriceAlarm {
  id: string;
  title: string;
  disposition: string;
  municipality: string;
  previousPrice: number;
  currentPrice: number;
  dropPct: number;
  sourceUrl: string;
  detectedAt: string;
}

interface PriceAlarmsProps {
  alarms: PriceAlarm[];
  onViewAll?: () => void;
}

export function PriceAlarms({ alarms, onViewAll }: PriceAlarmsProps) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
          <Bell className="h-4 w-4 text-yellow-400" />
          Cenové alarmy
          {alarms.length > 0 && (
            <span className="ml-1 h-4 w-4 rounded-full bg-yellow-500 text-[10px] font-bold text-black flex items-center justify-center">
              {alarms.length}
            </span>
          )}
        </CardTitle>
        {onViewAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="text-xs text-slate-400 hover:text-white h-7"
          >
            Zobrazit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {alarms.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-4">
            Žádné cenové poklesy v sledovaných inzerátech.
          </p>
        ) : (
          alarms.slice(0, 4).map((alarm) => (
            <div
              key={alarm.id}
              className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {alarm.disposition} · {alarm.municipality}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <TrendingDown className="h-3 w-3 text-red-400" />
                  <span className="text-xs text-red-400 font-bold">
                    −{alarm.dropPct}%
                  </span>
                  <span className="text-xs text-slate-500">
                    {alarm.currentPrice.toLocaleString("cs-CZ")} Kč
                  </span>
                </div>
              </div>
              <a
                href={alarm.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 p-1 text-slate-500 hover:text-white"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
