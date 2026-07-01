"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Loader2, ExternalLink } from "lucide-react";
import type { StoredListing } from "@/lib/listings-store";
import type { ParsedQuery } from "@/lib/ai-parser";

interface SearchResult {
  query: ParsedQuery;
  total: number;
  results: StoredListing[];
}

function formatPrice(price: number): string {
  return price > 0 ? price.toLocaleString("cs-CZ") + " Kč" : "—";
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-slate-600 text-xs">—</span>;
  const color =
    score >= 80
      ? "text-emerald-400 border-emerald-800 bg-emerald-950"
      : score >= 60
      ? "text-green-400 border-green-800 bg-green-950"
      : score >= 40
      ? "text-yellow-400 border-yellow-800 bg-yellow-950"
      : score >= 20
      ? "text-orange-400 border-orange-800 bg-orange-950"
      : "text-red-400 border-red-800 bg-red-950";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold border ${color}`}>
      {score}
    </span>
  );
}

export function ClientSearch() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setStatus("loading");
    setResult(null);
    setErrorMsg("");

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Chyba vyhledávání.");
        return;
      }
      setResult(data as SearchResult);
      setStatus("done");
    } catch {
      setStatus("error");
      setErrorMsg("Síťová chyba. Zkuste znovu.");
    }
  }

  const parsedMethod = result?.query.method;

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
          <Search className="h-4 w-4 text-violet-400" />
          Vyhledat pro klienta
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (status !== "idle") { setStatus("idle"); setResult(null); }
            }}
            placeholder='Např. "3+kk, Praha 4, MHD do 5 min, do 8 mil Kč, OV"'
            className="flex-1 h-9 rounded-md bg-slate-800 border border-slate-700 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
            disabled={status === "loading"}
          />
          <Button
            type="submit"
            size="sm"
            disabled={status === "loading" || !query.trim()}
            className="bg-violet-600 hover:bg-violet-500 text-white h-9 px-4 shrink-0"
          >
            {status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Hledat"
            )}
          </Button>
        </form>

        {status === "error" && (
          <p className="text-sm text-red-400">{errorMsg}</p>
        )}

        {status === "done" && result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Nalezeno{" "}
                <span className="text-white font-medium">{result.total}</span>{" "}
                inzerátů
                {parsedMethod && (
                  <span className="ml-2 text-slate-600">
                    [{parsedMethod === "ai" ? "AI parser" : "regex parser"}]
                  </span>
                )}
              </p>
              {result.query.municipality && (
                <span className="text-xs text-violet-400">
                  Lokalita: {result.query.municipality}
                </span>
              )}
            </div>

            {/* Přehled parsed parametrů */}
            <div className="flex flex-wrap gap-1.5">
              {result.query.disposition && (
                <span className="text-[11px] bg-slate-800 text-slate-300 rounded px-2 py-0.5">
                  {result.query.disposition}
                </span>
              )}
              {result.query.maxPriceKc && (
                <span className="text-[11px] bg-slate-800 text-slate-300 rounded px-2 py-0.5">
                  do {result.query.maxPriceKc.toLocaleString("cs-CZ")} Kč
                </span>
              )}
              {result.query.maxMhdMinutes && (
                <span className="text-[11px] bg-slate-800 text-slate-300 rounded px-2 py-0.5">
                  MHD ≤ {result.query.maxMhdMinutes} min
                </span>
              )}
              {result.query.ownershipType && (
                <span className="text-[11px] bg-slate-800 text-slate-300 rounded px-2 py-0.5">
                  {result.query.ownershipType}
                </span>
              )}
            </div>

            {result.results.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">
                Žádné inzeráty neodpovídají kritériím. Zkuste importovat relevantní inzeráty ze Sreality.
              </p>
            ) : (
              <div className="rounded-lg border border-slate-800 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="text-slate-500 text-xs font-medium h-8">Název</TableHead>
                      <TableHead className="text-slate-500 text-xs font-medium h-8">Cena</TableHead>
                      <TableHead className="text-slate-500 text-xs font-medium h-8">Kč/m²</TableHead>
                      <TableHead className="text-slate-500 text-xs font-medium h-8">Disp.</TableHead>
                      <TableHead className="text-slate-500 text-xs font-medium h-8">Lokalita</TableHead>
                      <TableHead className="text-slate-500 text-xs font-medium h-8 text-center">Skóre</TableHead>
                      <TableHead className="text-slate-500 text-xs font-medium h-8 w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.results.map((l) => (
                      <TableRow
                        key={l.id}
                        className="border-slate-800 hover:bg-slate-800/50 transition-colors"
                      >
                        <TableCell className="text-sm text-white max-w-[220px] truncate">
                          {l.title}
                        </TableCell>
                        <TableCell className="text-sm text-slate-200 font-medium tabular-nums">
                          {formatPrice(l.price)}
                        </TableCell>
                        <TableCell className="text-sm text-slate-400 tabular-nums">
                          {l.pricePerM2 ? l.pricePerM2.toLocaleString("cs-CZ") : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-300">
                          {l.disposition ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-slate-400 max-w-[140px] truncate">
                          {l.municipality ?? "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <ScoreBadge score={l.score?.total} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Link
                              href={`/listings/${l.id}`}
                              className="p-1 text-slate-500 hover:text-blue-400 transition-colors text-[10px] font-medium"
                            >
                              detail
                            </Link>
                            <a
                              href={l.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1 text-slate-500 hover:text-white transition-colors"
                              title="Otevřít originál"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
