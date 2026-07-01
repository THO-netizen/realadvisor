"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, Link2, Loader2, Download, ExternalLink,
  CheckCircle2, AlertCircle, Info, AlertTriangle, FileText,
} from "lucide-react";
import type { StoredListing } from "@/lib/listings-store";
import type { EATReport, EATSearchResponse, EATAnalyzeResponse } from "@/lib/eat/types";
import type { ParsedQuery } from "@/lib/ai-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtKc(n: number | null | undefined): string {
  if (!n) return "—";
  return n.toLocaleString("cs-CZ") + " Kč";
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-slate-600 text-xs">—</span>;
  const cls =
    score >= 80 ? "text-emerald-400 border-emerald-800 bg-emerald-950" :
    score >= 60 ? "text-green-400 border-green-800 bg-green-950" :
    score >= 40 ? "text-yellow-400 border-yellow-800 bg-yellow-950" :
    score >= 20 ? "text-orange-400 border-orange-800 bg-orange-950" :
                  "text-red-400 border-red-800 bg-red-950";
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold border ${cls}`}>{score}</span>;
}

function DeviationBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-slate-500 text-xs">—</span>;
  const good = pct >= 0;
  const cls = good ? "text-emerald-400" : "text-red-400";
  return (
    <span className={`text-xs font-medium ${cls}`}>
      {good ? "+" : ""}{pct.toFixed(1)} %
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tab: Search-by-spec
// ---------------------------------------------------------------------------
function SearchBySpec() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle"|"loading"|"done"|"error">("idle");
  const [result, setResult] = useState<EATSearchResponse | null>(null);
  const [err, setErr] = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setStatus("loading"); setResult(null); setErr("");

    const res = await fetch("/api/eat/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim() }),
    });
    const data = await res.json();
    if (!res.ok) { setStatus("error"); setErr(data.error ?? "Chyba."); return; }
    setResult(data as EATSearchResponse);
    setStatus("done");
  }

  const pq: ParsedQuery | null = result?.parsedQuery ?? null;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setStatus("idle"); setResult(null); }}
          placeholder='Např. "3+kk, Praha 4, MHD do 5 min, OV, do 7 mil Kč"'
          className="flex-1 h-9 rounded-md bg-slate-800 border border-slate-700 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
          disabled={status === "loading"}
        />
        <Button type="submit" size="sm" disabled={status === "loading" || !query.trim()}
          className="bg-violet-600 hover:bg-violet-500 text-white h-9 px-4 shrink-0">
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Hledat"}
        </Button>
      </form>

      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />{err}
        </div>
      )}

      {status === "done" && result && (
        <div className="space-y-3">
          {/* Parsed query chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">Detekováno:</span>
            {pq?.disposition && <Badge variant="outline" className="text-[11px] border-violet-800 text-violet-400">{pq.disposition}</Badge>}
            {pq?.municipality && <Badge variant="outline" className="text-[11px] border-violet-800 text-violet-400">{pq.municipality}</Badge>}
            {pq?.maxPriceKc && <Badge variant="outline" className="text-[11px] border-slate-700 text-slate-300">do {pq.maxPriceKc.toLocaleString("cs-CZ")} Kč</Badge>}
            {pq?.maxMhdMinutes && <Badge variant="outline" className="text-[11px] border-slate-700 text-slate-300">MHD ≤ {pq.maxMhdMinutes} min</Badge>}
            {pq?.ownershipType && <Badge variant="outline" className="text-[11px] border-slate-700 text-slate-300">{pq.ownershipType}</Badge>}
            <span className="text-xs text-slate-600 ml-auto">
              [{pq?.method === "ai" ? "GPT-4o-mini" : "regex"}]
            </span>
          </div>

          {result.suggestImport && (
            <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-950/40 border border-amber-800 rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Nalezeno méně než 3 inzeráty. Importujte relevantní nabídky ze Sreality přes záložku
                <strong> Analyzovat inzerát</strong>, nebo použijte formulář importu výše.
              </span>
            </div>
          )}

          <p className="text-xs text-slate-500">
            Nalezeno <span className="text-white font-medium">{result.total}</span> inzerátů, řazeno dle skóre
          </p>

          {result.results.length === 0 ? (
            <p className="text-slate-500 text-sm text-center py-6">
              Žádné inzeráty neodpovídají kritériím.
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
                    <TableHead className="text-slate-500 text-xs font-medium h-8 w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.results.map((l: StoredListing) => (
                    <TableRow key={l.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-sm text-white max-w-[200px] truncate">{l.title}</TableCell>
                      <TableCell className="text-sm text-slate-200 font-medium tabular-nums">{fmtKc(l.price)}</TableCell>
                      <TableCell className="text-sm text-slate-400 tabular-nums">{l.pricePerM2?.toLocaleString("cs-CZ") ?? "—"}</TableCell>
                      <TableCell className="text-sm text-slate-300">{l.disposition ?? "—"}</TableCell>
                      <TableCell className="text-sm text-slate-400 max-w-[130px] truncate">{l.municipality ?? "—"}</TableCell>
                      <TableCell className="text-center"><ScoreBadge score={l.score?.total} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Link href={`/listings/${l.id}`} className="p-1 text-slate-500 hover:text-blue-400 text-[10px] font-medium">detail</Link>
                          <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-500 hover:text-white"><ExternalLink className="h-3.5 w-3.5" /></a>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Direct-analysis
// ---------------------------------------------------------------------------
function DirectAnalysis() {
  const [url, setUrl] = useState("");
  const [clientName, setClientName] = useState("");
  const [advisorNotes, setAdvisorNotes] = useState("");
  const [status, setStatus] = useState<"idle"|"loading"|"done"|"error">("idle");
  const [result, setResult] = useState<EATAnalyzeResponse | null>(null);
  const [err, setErr] = useState("");
  const [step, setStep] = useState(0);

  const STEPS = ["Stahování inzerátu…", "Valuo tržní odhad…", "RÚIAN ověření…", "Generování reportu…"];

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setStatus("loading"); setResult(null); setErr(""); setStep(0);

    // Simulace vizuálního průběhu kroků
    const stepTimer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);

    try {
      const res = await fetch("/api/eat/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          clientName: clientName.trim() || undefined,
          advisorNotes: advisorNotes.trim() || undefined,
        }),
      });
      clearInterval(stepTimer);
      const data = await res.json();
      if (!res.ok) { setStatus("error"); setErr(data.error ?? "Chyba analýzy."); return; }
      setResult(data as EATAnalyzeResponse);
      setStatus("done");
    } catch {
      clearInterval(stepTimer);
      setStatus("error"); setErr("Síťová chyba.");
    }
  }

  const report: EATReport | null = result?.report ?? null;

  return (
    <div className="space-y-4">
      <form onSubmit={handleAnalyze} className="space-y-3">
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setStatus("idle"); setResult(null); }}
          placeholder="https://www.sreality.cz/detail/prodej/byt/3+kk/..."
          className="w-full h-9 rounded-md bg-slate-800 border border-slate-700 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          disabled={status === "loading"}
        />
        <div className="flex gap-3">
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Jméno klienta (volitelné)"
            className="flex-1 h-9 rounded-md bg-slate-800 border border-slate-700 px-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 transition-colors"
            disabled={status === "loading"}
          />
          <Button
            type="submit"
            size="sm"
            disabled={status === "loading" || !url.trim()}
            className="bg-blue-600 hover:bg-blue-500 text-white h-9 px-5 shrink-0"
          >
            {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyzovat"}
          </Button>
        </div>
        <textarea
          value={advisorNotes}
          onChange={(e) => setAdvisorNotes(e.target.value)}
          placeholder="Poznámky poradce pro PDF report (volitelné)…"
          rows={2}
          className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 transition-colors resize-none"
          disabled={status === "loading"}
        />
      </form>

      {/* Pipeline progress */}
      {status === "loading" && (
        <div className="space-y-1.5 rounded-lg bg-slate-800/60 border border-slate-700 p-4">
          {STEPS.map((s, i) => (
            <div key={i} className={`flex items-center gap-2 text-sm ${i < step ? "text-emerald-400" : i === step ? "text-white" : "text-slate-600"}`}>
              {i < step ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              ) : i === step ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border border-slate-700 shrink-0" />
              )}
              {s}
            </div>
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="flex items-start gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{err}
        </div>
      )}

      {/* Výsledek */}
      {status === "done" && report && (
        <div className="space-y-4">
          {/* Hlavička výsledku */}
          <div className="flex items-start justify-between gap-4 p-4 bg-slate-800/60 border border-slate-700 rounded-lg">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">{report.listing.title}</p>
              <p className="text-xs text-slate-400">{report.listing.municipality ?? report.listing.addressText}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {report.listing.ownershipType && (
                  <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">{report.listing.ownershipType}</Badge>
                )}
                {report.listing.isPartial && (
                  <Badge variant="outline" className="text-[10px] border-yellow-800 text-yellow-500">Neúplná data</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <ScoreBadge score={report.score?.total} />
              {report.score && <span className="text-[11px] text-slate-500">{report.score.label}</span>}
            </div>
          </div>

          {/* Cenové srovnání */}
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <div className="bg-slate-800/50 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Cenová analýza
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
                  <TableHead className="text-slate-500 text-xs font-medium h-8">Ukazatel</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium h-8">Hodnota</TableHead>
                  <TableHead className="text-slate-500 text-xs font-medium h-8">Odchylka</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="border-slate-800">
                  <TableCell className="text-sm text-slate-300">Nabídková cena</TableCell>
                  <TableCell className="text-sm font-semibold text-white tabular-nums">{fmtKc(report.listing.price)}</TableCell>
                  <TableCell>—</TableCell>
                </TableRow>
                <TableRow className="border-slate-800">
                  <TableCell className="text-sm text-slate-300">
                    Odhad Valuo
                    <span className="ml-1 text-[10px] text-slate-600">({report.valuoEstimate.source})</span>
                  </TableCell>
                  <TableCell className="text-sm font-semibold text-white tabular-nums">{fmtKc(report.valuoEstimate.estimatedValue)}</TableCell>
                  <TableCell>
                    <DeviationBadge pct={report.valuoEstimate.deviationPct !== null ? -report.valuoEstimate.deviationPct : null} />
                  </TableCell>
                </TableRow>
                {report.localityStats?.medianPrice && (
                  <TableRow className="border-slate-800">
                    <TableCell className="text-sm text-slate-300">Median lokality</TableCell>
                    <TableCell className="text-sm text-slate-200 tabular-nums">{fmtKc(report.localityStats.medianPrice)}</TableCell>
                    <TableCell>
                      <DeviationBadge pct={
                        report.listing.price && report.localityStats.medianPrice
                          ? Math.round(((report.listing.price - report.localityStats.medianPrice) / report.localityStats.medianPrice) * 1000) / 10
                          : null
                      } />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* RÚIAN + risk flags */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase">RÚIAN adresní ověření</p>
              <div className={`flex items-center gap-1.5 text-sm ${report.ruian.found ? "text-emerald-400" : "text-amber-400"}`}>
                {report.ruian.found ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {report.ruian.found ? "Adresa ověřena" : "Adresa neověřena"}
              </div>
              {report.ruian.officialAddress && (
                <p className="text-xs text-slate-400">{report.ruian.officialAddress}</p>
              )}
              <p className="text-[10px] text-slate-600">Zdroj: {report.ruian.source}</p>
            </div>

            <div className="rounded-lg border border-slate-800 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase">Rizikové faktory</p>
              {(report.score?.flags.length ?? 0) === 0 ? (
                <div className="flex items-center gap-1.5 text-sm text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />Žádné rizika
                </div>
              ) : (
                <div className="space-y-1">
                  {report.score!.flags.slice(0, 4).map((f) => (
                    <div key={f} className="flex items-center gap-1.5 text-xs text-orange-400">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {f.replace(/_/g, " ").toLowerCase()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Akce */}
          <div className="flex items-center gap-3">
            <a
              href={`/api/eat/report/${result!.reportId}`}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Download className="h-4 w-4" />
              Stáhnout PDF report
            </a>
            <Link
              href={`/listings/${report.listing.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <FileText className="h-4 w-4" />
              Detail inzerátu
            </Link>
            <a
              href={report.listing.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 border border-slate-700 hover:border-slate-500 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Otevřít originál
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hlavní panel — EAT tabs
// ---------------------------------------------------------------------------
export function EATPanel() {
  const [tab, setTab] = useState<"search" | "analyze">("search");

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
          <span className="text-blue-400 font-bold text-base">EAT</span>
          Estate Analysis Tool
        </CardTitle>
        {/* Tabs */}
        <div className="flex gap-0 mt-3 border-b border-slate-800">
          <button
            onClick={() => setTab("search")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "search"
                ? "border-violet-500 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            Search-by-spec
          </button>
          <button
            onClick={() => setTab("analyze")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === "analyze"
                ? "border-blue-500 text-white"
                : "border-transparent text-slate-500 hover:text-slate-300"
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            Direct-analysis
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {tab === "search" ? <SearchBySpec /> : <DirectAnalysis />}
      </CardContent>
    </Card>
  );
}
