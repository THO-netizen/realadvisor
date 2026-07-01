"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Building2,
  TrendingUp,
  Bell,
  Eye,
  Home,
  Search,
  Users,
  FileText,
  Settings,
  MapPin,
  TrendingDown,
  Clock,
  Star,
} from "lucide-react";

const ICON_MAP = {
  building2: Building2,
  trending: TrendingUp,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  bell: Bell,
  eye: Eye,
  home: Home,
  search: Search,
  users: Users,
  file: FileText,
  settings: Settings,
  map: MapPin,
  clock: Clock,
  star: Star,
} as const;

export type StatCardIcon = keyof typeof ICON_MAP;

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: StatCardIcon;
  actionLabel?: string;
  onAction?: () => void;
  trend?: { value: number; label: string };
  accentColor?: "blue" | "green" | "yellow" | "red";
}

const accentMap = {
  blue: "text-blue-400",
  green: "text-emerald-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
};

export function StatCard({
  title,
  value,
  description,
  icon,
  actionLabel,
  onAction,
  trend,
  accentColor = "blue",
}: StatCardProps) {
  const Icon = ICON_MAP[icon];

  return (
    <Card className="bg-slate-900 border-slate-800 hover:border-slate-700 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">
          {title}
        </CardTitle>
        <Icon className={`h-4 w-4 ${accentMap[accentColor]}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accentMap[accentColor]}`}>
          {value}
        </div>
        {description && (
          <p className="text-xs text-slate-500 mt-1">{description}</p>
        )}
        {trend && (
          <p
            className={`text-xs mt-1 ${trend.value >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {trend.value >= 0 ? "+" : ""}
            {trend.value} {trend.label}
          </p>
        )}
        {actionLabel && onAction && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAction}
            className="mt-3 h-7 px-0 text-xs text-slate-400 hover:text-white hover:bg-transparent"
          >
            {actionLabel} →
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
