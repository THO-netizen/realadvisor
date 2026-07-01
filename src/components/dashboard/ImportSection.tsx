"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { StoredListing } from "@/lib/listings-store";

interface ImportSectionProps {
  initialListings: StoredListing[];
}

function formatPrice(price: number): string {
  return price.toLocaleString("cs-CZ") + " Kč";
}

function relativeDays(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "dnes";
  if (days === 1) return "včera";
  return `před ${days} dny`;
}

export function ImportSection({ initialListings }: ImportSectionProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [listings, setListings] = useState<StoredListing[]>(initialListings);
  const [isPending, startTransition] = useTransition();

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/listings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Neznámá chyba.");
        return;
      }

      const newListing: StoredListing = data.listing;
      const warning: string | null = data.robotsWarning ?? null;

      // Optimistická aktualizace — přidáme/nahradíme v lokálním stavu
      setListings((prev) => {
        const exists = prev.findIndex((l) => l.sourceUrl === newListing.sourceUrl);
        if (exists !== -1) {
          const updated = [...prev];
          updated[exists] = newListing;
          return updated;
        }
        return [newListing, ...prev];
      });

      const isNew = newListing.firstSeenAt === newListing.lastSeenAt;
      const isPartial = (data.listing as { isPartial?: boolean })?.isPartial;
      setStatus("ok");
      setMessage(
        (isNew ? "Inzerát uložen." : "Inzerát aktualizován.") +
        (isPartial ? " Metadata byla načtena z URL — cena a plocha nejsou dostupné, ověřte je v originálu." : "") +
        (warning ? ` ⚠ ${warning}` : "")
      );
      setUrl("");

      // Refresh Server Component pro aktualizaci StatCard počítadel
      startTransition(() => router.refresh());
    } catch {
      setStatus("error");
      setMessage("Síťová chyba. Zkontrolujte připojení a zkuste znovu.");
    }
  }

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
          <Download className="h-4 w-4 text-blue-400" />
          Import inzerátu ze Sreality
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Formulář */}
        <form onSubmit={handleImport} className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (status !== "idle") setStatus("idle");
            }}
            placeholder="https://www.sreality.cz/detail/prodej/byt/2+kk/..."
            className="flex-1 h-9 rounded-md bg-slate-800 border border-slate-700 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            disabled={status === "loading"}
          />
          <Button
            type="submit"
            size="sm"
            disabled={status === "loading" || !url.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white h-9 px-4 shrink-0"
          >
            {status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Importovat"
            )}
          </Button>
        </form>

        {/* Stavová zpráva */}
        {status === "ok" && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {message}
          </div>
        )}
        {status === "error" && (
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {message}
          </div>
        )}

        {/* Tabulka importovaných inzerátů */}
        {listings.length > 0 && (
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs font-medium h-8">
                    Název
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium h-8">
                    Cena
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium h-8">
                    Kč/m²
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium h-8">
                    Disp.
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium h-8">
                    Plocha
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium h-8">
                    Lokalita
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium h-8">
                    Přidáno
                  </TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium h-8 w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map((listing) => (
                  <TableRow
                    key={listing.id}
                    className="border-slate-800 hover:bg-slate-800/50 transition-colors"
                  >
                    <TableCell className="text-sm text-white max-w-[220px]">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] border-slate-700 text-slate-400 py-0 shrink-0"
                        >
                          {listing.source}
                        </Badge>
                        <span className="truncate" title={listing.title}>
                          {listing.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-200 font-medium tabular-nums">
                      {listing.price > 0 ? formatPrice(listing.price) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-400 tabular-nums">
                      {listing.pricePerM2
                        ? listing.pricePerM2.toLocaleString("cs-CZ")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-300">
                      {listing.disposition ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-300 tabular-nums">
                      {listing.usableArea ? `${listing.usableArea} m²` : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-400 max-w-[140px] truncate">
                      {listing.municipality ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {relativeDays(listing.firstSeenAt)}
                    </TableCell>
                    <TableCell>
                      <a
                        href={listing.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-slate-500 hover:text-white transition-colors flex items-center justify-center"
                        title="Otevřít originál"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {listings.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-4">
            Zatím žádné importované inzeráty. Vložte URL ze Sreality výše.
          </p>
        )}

        <p className="text-[10px] text-slate-600">
          RealAdvisor ukládá pouze metadata (název, cenu, lokalitu, plochu). Fotografie ani celé texty inzerátů nejsou ukládány. Respektujeme robots.txt a limit 1 req/2 s.
        </p>
      </CardContent>
    </Card>
  );
}
