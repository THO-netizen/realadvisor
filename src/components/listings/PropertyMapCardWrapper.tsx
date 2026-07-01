"use client";

// `ssr: false` musí být v Client Componentě (Next.js 16 requirement)
import dynamic from "next/dynamic";
import type { PropertyMapCardProps } from "./PropertyMapCard";

const PropertyMapCard = dynamic(() => import("./PropertyMapCard"), {
  ssr: false,
  loading: () => (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="h-4 w-48 bg-slate-800 rounded animate-pulse" />
      </div>
      <div className="h-[360px] bg-slate-800/50 flex items-center justify-center">
        <span className="text-slate-600 text-sm">Načítání mapy…</span>
      </div>
      <div className="px-5 py-3 border-t border-slate-800">
        <div className="h-4 w-64 bg-slate-800 rounded animate-pulse" />
      </div>
    </div>
  ),
});

export function PropertyMapCardWrapper(props: PropertyMapCardProps) {
  return <PropertyMapCard {...props} />;
}
