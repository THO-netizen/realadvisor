"use client";

import { useState, useRef, useCallback } from "react";
import type { AnalysisResult } from "@/lib/statistical-model";

type ApiResponse = AnalysisResult & { error?: string };
type LoadState = "idle" | "loading" | "done" | "error";

const NEON = "#39ff14";

function czNum(n: number, decimals = 0) {
  return n.toLocaleString("cs-CZ", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ---------------------------------------------------------------------------
// Verdikt
// ---------------------------------------------------------------------------

function Verdict({ result }: { result: AnalysisResult }) {
  const { diffPct, direction, listingPricePerM2, reasMedianPerM2 } = result;

  if (!diffPct || !direction || !listingPricePerM2 || !reasMedianPerM2) {
    return (
      <div className="rounded-md p-4" style={{ border: `1px solid ${NEON}20` }}>
        <p className="text-xs" style={{ color: `${NEON}60` }}>
          Tržní porovnání nelze provést — chybí cena/m² nebo data Reas pro tuto lokalitu.
        </p>
      </div>
    );
  }

  const pct = Math.abs(diffPct).toFixed(1);

  if (direction === "below") {
    return (
      <div className="rounded-md p-5" style={{ border: `1px solid ${NEON}40`, background: `${NEON}06` }}>
        <p className="text-[10px] tracking-widest uppercase mb-3 font-bold" style={{ color: `${NEON}60` }}>
          Cenový verdikt
        </p>
        <p
          className="text-5xl font-black tracking-tight leading-none"
          style={{ color: NEON, textShadow: `0 0 24px ${NEON}80` }}
        >
          ▼ POD CENOU
        </p>
        <p className="text-2xl font-bold mt-2" style={{ color: NEON }}>
          o {pct} %
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <Stat label="Inzerát" value={`${czNum(listingPricePerM2)} Kč/m²`} />
          <Stat label="Reas medián" value={`${czNum(reasMedianPerM2)} Kč/m²`} color={NEON} />
        </div>
      </div>
    );
  }

  if (direction === "above") {
    return (
      <div className="rounded-md p-5 border border-rose-500/30 bg-rose-950/20">
        <p className="text-[10px] tracking-widest uppercase mb-3 font-bold" style={{ color: `${NEON}60` }}>
          Cenový verdikt
        </p>
        <p className="text-5xl font-black tracking-tight leading-none" style={{ color: NEON }}>
          ▲ PŘEDRAŽENO
        </p>
        <p className="text-2xl font-bold mt-2" style={{ color: NEON }}>
          o {pct} %
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <Stat label="Inzerát" value={`${czNum(listingPricePerM2)} Kč/m²`} />
          <Stat label="Reas medián" value={`${czNum(reasMedianPerM2)} Kč/m²`} color={NEON} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md p-5" style={{ border: `1px solid ${NEON}25`, background: `${NEON}04` }}>
      <p className="text-[10px] tracking-widest uppercase mb-3 font-bold" style={{ color: `${NEON}60` }}>
        Cenový verdikt
      </p>
      <p className="text-4xl font-black tracking-tight leading-none" style={{ color: NEON }}>
        ≈ ODPOVÍDÁ TRHU
      </p>
      <p className="text-lg font-medium mt-2" style={{ color: `${NEON}80` }}>
        {diffPct > 0 ? "+" : ""}{czNum(diffPct, 1)} % od mediánu
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Stat label="Inzerát" value={`${czNum(listingPricePerM2)} Kč/m²`} />
        <Stat label="Reas medián" value={`${czNum(reasMedianPerM2)} Kč/m²`} color={NEON} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span className="block mb-0.5" style={{ color: `${NEON}55` }}>{label}</span>
      <span className="font-medium tabular-nums" style={{ color: color ?? "white" }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Karta inzerátu
// ---------------------------------------------------------------------------

function ListingCard({ data }: { data: AnalysisResult }) {
  return (
    <div className="rounded-md p-4" style={{ border: `1px solid ${NEON}15`, background: `${NEON}03` }}>
      <p className="text-[10px] tracking-widest uppercase mb-3 font-bold" style={{ color: `${NEON}65` }}>
        Inzerát
      </p>
      <h2 className="text-sm font-medium text-white leading-snug line-clamp-2 mb-1">
        {data.title || "Bez názvu"}
      </h2>
      <a
        href={data.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[10px] truncate block mb-3"
        style={{ color: `${NEON}40` }}
      >
        {data.url}
      </a>
      {data.price > 0 && <Row label="Cena" value={`${czNum(data.price)} Kč`} />}
      {data.usableArea && <Row label="Plocha" value={`${data.usableArea} m²`} />}
      {data.listingPricePerM2 && <Row label="Cena/m²" value={`${czNum(data.listingPricePerM2)} Kč/m²`} />}
      {data.reasMedianPerM2 && (
        <Row label="Reas medián" value={`${czNum(data.reasMedianPerM2)} Kč/m²`} highlight />
      )}
      {data.disposition && <Row label="Dispozice" value={data.disposition} />}
      {data.condition && <Row label="Stav" value={data.condition} />}
      {data.municipality && <Row label="Lokalita" value={data.municipality} />}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-white/5">
      <span className="text-xs" style={{ color: `${NEON}80` }}>{label}</span>
      <span
        className="text-sm font-medium tabular-nums"
        style={{ color: highlight ? NEON : "white" }}
      >
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hlavní stránka
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<LoadState>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const analyze = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }

    setState("loading");
    setResult(null);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok || data.error) {
        setState("error");
        setErrorMsg(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(data);
      setState("done");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Síťová chyba.");
    }
  }, [url]);

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-16 pb-12 px-4">
      <div className="w-full max-w-2xl space-y-6">

        {/* Hero */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Analyzátor nemovitostí</h1>
          <p className="text-sm mt-1" style={{ color: `${NEON}70` }}>
            Vložte URL inzerátu ze Sreality, Bezrealitky, iDNES nebo Bazoš.
          </p>
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="url"
            placeholder="https://www.sreality.cz/detail/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void analyze()}
            disabled={state === "loading"}
            className="flex-1 bg-white/5 rounded-md px-4 py-3 text-sm text-white outline-none transition-colors disabled:opacity-40"
            style={{ border: `1px solid ${NEON}35`, caretColor: NEON }}
            onFocus={(e) => (e.currentTarget.style.borderColor = `${NEON}80`)}
            onBlur={(e) => (e.currentTarget.style.borderColor = `${NEON}35`)}
          />
          <button
            onClick={() => void analyze()}
            disabled={state === "loading" || !url.trim()}
            className="px-6 py-3 rounded-md text-sm font-bold tracking-wide transition-all"
            style={{
              border: `1px solid ${NEON}60`,
              color: state === "loading" || !url.trim() ? `${NEON}35` : NEON,
              background: "transparent",
              cursor: state === "loading" || !url.trim() ? "not-allowed" : "pointer",
              textShadow: state === "loading" || !url.trim() ? "none" : `0 0 8px ${NEON}`,
            }}
          >
            {state === "loading" ? "Analyzuji…" : "Analyzovat"}
          </button>
        </div>

        {/* Loading */}
        {state === "loading" && (
          <div className="space-y-1.5">
            {["Krok A — scraping portálu…", "Krok B — Reas.cz tržní data…", "Krok C — porovnání cen…"].map((s, i) => (
              <div key={s} className="flex items-center gap-2 text-xs" style={{ color: `${NEON}55` }}>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: NEON, animationDelay: `${i * 200}ms`, boxShadow: `0 0 4px ${NEON}` }}
                />
                {s}
              </div>
            ))}
          </div>
        )}

        {/* Chyba */}
        {state === "error" && errorMsg && (
          <div className="rounded-md p-4" style={{ border: `1px solid ${NEON}30`, background: `${NEON}05` }}>
            <p className="text-[10px] uppercase tracking-widest mb-1 font-bold" style={{ color: `${NEON}60` }}>
              Chyba
            </p>
            <p className="text-sm font-medium" style={{ color: NEON }}>{errorMsg}</p>
          </div>
        )}

        {/* Výsledky */}
        {state === "done" && result && (
          <div className="space-y-4">
            <Verdict result={result} />
            <ListingCard data={result} />
            {result.warnings.length > 0 && (
              <div className="rounded-md p-3 space-y-1" style={{ border: `1px solid ${NEON}20` }}>
                <p className="text-[10px] tracking-widest uppercase font-bold" style={{ color: `${NEON}50` }}>
                  Upozornění
                </p>
                {result.warnings.map((w, i) => (
                  <p key={i} className="text-xs" style={{ color: `${NEON}70` }}>
                    · {w}
                  </p>
                ))}
              </div>
            )}
            <p className="text-[10px]" style={{ color: `${NEON}25` }}>
              Analyzováno: {new Date(result.analyzedAt).toLocaleString("cs-CZ")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
