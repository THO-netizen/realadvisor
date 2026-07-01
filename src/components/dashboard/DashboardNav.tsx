"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Users,
  FileText,
  Settings,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/search", label: "Vyhledávání", icon: Search },
  { href: "/clients", label: "Klienti", icon: Users },
  { href: "/reports", label: "Reporty", icon: FileText },
  { href: "/settings", label: "Nastavení", icon: Settings },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed left-0 top-0 h-full w-56 bg-slate-900 border-r border-slate-800 flex flex-col z-50">
      <div className="px-4 py-5 border-b border-slate-800">
        <h1 className="text-lg font-bold text-white tracking-tight">
          RealAdvisor
        </h1>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">
          Interní nástroj
        </p>
      </div>

      <div className="flex-1 py-4 space-y-1 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-blue-600/20 text-blue-400 font-medium"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="px-4 py-4 border-t border-slate-800">
        <p className="text-xs font-medium text-white">Poradce</p>
        <p className="text-[10px] text-slate-500 mt-0.5">RealAdvisor</p>
      </div>
    </nav>
  );
}
