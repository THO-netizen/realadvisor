// PDF generátor — analytický report pro klienta
// Používá PDFKit (server-side, čistý Node.js)
// A4 = 595 × 842 pt; marže 50 pt
// Fonty: Helvetica (built-in) — české znaky transliterovány
// Volitelný vlastní font: REPORT_FONT_PATH=/path/to/font.ttf

import PDFDocument from "pdfkit";
import type { EATReport } from "./types";
import type { RiskFlag } from "@/lib/scoring";

// ---------------------------------------------------------------------------
// Barvy (RGB 0–255)
// ---------------------------------------------------------------------------
const C = {
  white:    [255, 255, 255] as [number,number,number],
  black:    [15, 23, 42]   as [number,number,number],
  slate50:  [248, 250, 252] as [number,number,number],
  slate100: [241, 245, 249] as [number,number,number],
  slate200: [226, 232, 240] as [number,number,number],
  slate400: [148, 163, 184] as [number,number,number],
  slate600: [71, 85, 105]  as [number,number,number],
  blue600:  [37, 99, 235]  as [number,number,number],
  blue700:  [29, 78, 216]  as [number,number,number],
  emerald:  [21, 128, 61]  as [number,number,number],
  green:    [34, 197, 94]  as [number,number,number],
  yellow:   [202, 138, 4]  as [number,number,number],
  orange:   [234, 88, 12]  as [number,number,number],
  red:      [185, 28, 28]  as [number,number,number],
  amber:    [217, 119, 6]  as [number,number,number],
  violet:   [124, 58, 237] as [number,number,number],
};

// ---------------------------------------------------------------------------
// Czech text transliteration (Helvetica nemá Latin-2)
// ---------------------------------------------------------------------------
const CZ: Record<string, string> = {
  á:"a",č:"c",ď:"d",é:"e",ě:"e",í:"i",ň:"n",ó:"o",ř:"r",š:"s",ť:"t",ú:"u",ů:"u",ý:"y",ž:"z",
  Á:"A",Č:"C",Ď:"D",É:"E",Ě:"E",Í:"I",Ň:"N",Ó:"O",Ř:"R",Š:"S",Ť:"T",Ú:"U",Ů:"U",Ý:"Y",Ž:"Z",
};
function t(s: string | null | undefined): string {
  if (!s) return "";
  // Pokud máme custom font, vrátíme string beze změny
  if (process.env.REPORT_FONT_PATH) return s;
  return s.split("").map((c) => CZ[c] ?? c).join("");
}

// ---------------------------------------------------------------------------
// Helpers pro skóre barvy
// ---------------------------------------------------------------------------
function scoreRGB(score: number): [number,number,number] {
  if (score >= 80) return C.emerald;
  if (score >= 60) return C.green;
  if (score >= 40) return C.yellow;
  if (score >= 20) return C.orange;
  return C.red;
}

function fmtKc(n: number | null | undefined): string {
  if (!n) return "—";
  return n.toLocaleString("cs-CZ") + " Kc";
}

function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(1) + " %";
}

// ---------------------------------------------------------------------------
// Kreslicí primitiva
// ---------------------------------------------------------------------------

function hline(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  color = C.slate200,
  thickness = 0.5
) {
  doc.save()
    .moveTo(x, y).lineTo(x + width, y)
    .strokeColor(color).lineWidth(thickness).stroke()
    .restore();
}

/**
 * Horizontální bar chart pro jednu skórovací dimenzi
 */
function drawScoreBar(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  barW: number,
  label: string,
  value: number,
  weight: string
) {
  const barH = 12;
  const color = scoreRGB(value);
  const fillW = Math.round((value / 100) * barW);

  // Popisek vlevo
  doc.save()
    .fillColor(C.slate600).font("Helvetica").fontSize(8)
    .text(t(label), x, y + 2, { width: 140, lineBreak: false })
    .restore();

  // Váha
  doc.save()
    .fillColor(C.slate400).font("Helvetica").fontSize(7)
    .text(weight, x + 140, y + 3, { width: 30, lineBreak: false })
    .restore();

  // Pozadí baru
  const bx = x + 176;
  doc.save()
    .rect(bx, y, barW, barH).fillColor(C.slate100).fill()
    .restore();

  // Vyplněná část
  if (fillW > 0) {
    doc.save()
      .rect(bx, y, fillW, barH).fillColor(color).fill()
      .restore();
  }

  // Hodnota vpravo
  doc.save()
    .fillColor(color).font("Helvetica-Bold").fontSize(9)
    .text(String(value), bx + barW + 6, y + 1, { width: 28, lineBreak: false })
    .restore();
}

/**
 * Záhlaví každé stránky
 */
function drawHeader(
  doc: PDFKit.PDFDocument,
  title: string,
  page: number,
  total: number
) {
  const W = doc.page.width;
  const M = 50;

  // Modrý pruh
  doc.save()
    .rect(0, 0, W, 38).fillColor(C.blue700).fill()
    .restore();

  // Logo / brand
  doc.save()
    .fillColor(C.white).font("Helvetica-Bold").fontSize(13)
    .text("RealAdvisor", M, 12, { lineBreak: false })
    .restore();

  // Název sekce
  doc.save()
    .fillColor([180, 210, 255] as unknown as string).font("Helvetica").fontSize(9)
    .text(t(title), M + 110, 15, { lineBreak: false })
    .restore();

  // Číslo stránky
  doc.save()
    .fillColor(C.white).font("Helvetica").fontSize(8)
    .text(`${page} / ${total}`, W - M - 30, 15, { lineBreak: false })
    .restore();
}

/**
 * Zápatí stránky
 */
function drawFooter(doc: PDFKit.PDFDocument, date: string) {
  const W = doc.page.width;
  const Y = doc.page.height - 32;
  const M = 50;

  hline(doc, M, Y, W - M * 2);

  doc.save()
    .fillColor(C.slate400).font("Helvetica").fontSize(7)
    .text(
      `Vygenerovano: ${date}  |  RealAdvisor — analyticky nastroj pro financni poradce  |  Data jsou orientacni.`,
      M, Y + 6, { width: W - M * 2, lineBreak: false }
    )
    .restore();
}

/**
 * Jednoduché tabulka buněk
 */
function drawTable(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  rows: Array<[string, string, string?]>,
  colWidths: [number, number, number?] = [200, 160, 100]
) {
  const rowH = 20;
  const totalW = colWidths.reduce<number>((s, w) => s + (w ?? 0), 0);

  rows.forEach((row, i) => {
    const ry = y + i * rowH;
    const bg = i === 0 ? C.slate100 : i % 2 === 0 ? C.white : C.slate50;

    doc.save()
      .rect(x, ry, totalW, rowH).fillColor(bg).fill()
      .restore();

    row.forEach((cell, ci) => {
      const cx = x + (ci === 0 ? 0 : ci === 1 ? colWidths[0] : (colWidths[0] + (colWidths[1] ?? 0)));
      const isHeader = i === 0;
      const isNum = ci > 0;

      doc.save()
        .fillColor(isHeader ? C.blue700 : C.black)
        .font(isHeader ? "Helvetica-Bold" : isNum ? "Helvetica" : "Helvetica")
        .fontSize(isHeader ? 8 : 9)
        .text(t(cell ?? ""), cx + 6, ry + 6, {
          width: (colWidths[ci] ?? 80) - 12,
          lineBreak: false,
        })
        .restore();
    });

    hline(doc, x, ry + rowH, totalW, C.slate200);
  });

  // Vnější ohraničení
  doc.save()
    .rect(x, y, totalW, rows.length * rowH)
    .strokeColor(C.slate200).lineWidth(0.8).stroke()
    .restore();
}

// ---------------------------------------------------------------------------
// Stránky
// ---------------------------------------------------------------------------

function page1Cover(
  doc: PDFKit.PDFDocument,
  report: EATReport,
  date: string
) {
  const W = doc.page.width;
  const M = 50;
  const listing = report.listing;

  drawHeader(doc, "Analyticke shrnutí", 1, 4);

  // Titulní blok
  const titleY = 60;
  doc.save()
    .fillColor(C.black).font("Helvetica-Bold").fontSize(15)
    .text(t(listing.title), M, titleY, { width: W - M * 2 })
    .restore();

  const addrY = titleY + 26;
  doc.save()
    .fillColor(C.slate600).font("Helvetica").fontSize(10)
    .text(t(listing.addressText ?? listing.municipality ?? ""), M, addrY, { width: W - M * 2 })
    .restore();

  if (report.clientName) {
    doc.save()
      .fillColor(C.blue600).font("Helvetica-Bold").fontSize(9)
      .text(`Pripraveno pro: ${t(report.clientName)}`, M, addrY + 16, { width: W - M * 2 })
      .restore();
  }

  hline(doc, M, addrY + 36, W - M * 2, C.blue600, 1.5);

  // Klíčové metriky (3 karty vedle sebe)
  const cardY = addrY + 48;
  const cardW = (W - M * 2 - 20) / 3;
  const cards: Array<[string, string, [number,number,number]]> = [
    ["Nabídková cena", fmtKc(listing.price), C.black],
    ["Plocha", listing.usableArea ? `${listing.usableArea} m2` : "—", C.black],
    ["Dispozice", t(listing.disposition ?? "—"), C.black],
  ];

  cards.forEach(([label, value, color], i) => {
    const cx = M + i * (cardW + 10);
    doc.save()
      .rect(cx, cardY, cardW, 52).fillColor(C.slate50)
      .strokeColor(C.slate200).lineWidth(0.8).fillAndStroke()
      .restore();
    doc.save()
      .fillColor(C.slate600).font("Helvetica").fontSize(8)
      .text(t(label), cx + 10, cardY + 10, { width: cardW - 20, lineBreak: false })
      .restore();
    doc.save()
      .fillColor(color).font("Helvetica-Bold").fontSize(13)
      .text(t(value), cx + 10, cardY + 24, { width: cardW - 20, lineBreak: false })
      .restore();
  });

  // Celkové skóre (velký odznak)
  const score = report.score;
  const scoreY = cardY + 70;
  if (score) {
    const rgb = scoreRGB(score.total);
    doc.save()
      .rect(M, scoreY, W - M * 2, 64).fillColor(C.slate50)
      .strokeColor(C.slate200).lineWidth(0.8).fillAndStroke()
      .restore();

    // Číslo skóre
    doc.save()
      .fillColor(rgb).font("Helvetica-Bold").fontSize(36)
      .text(String(score.total), M + 16, scoreY + 10, { lineBreak: false })
      .restore();

    // Štítek
    doc.save()
      .fillColor(rgb).font("Helvetica-Bold").fontSize(12)
      .text(t(score.label), M + 72, scoreY + 14, { lineBreak: false })
      .restore();

    // Dílčí skóre (malá čísla)
    const sub: Array<[string, number]> = [
      ["Cena", score.price],
      ["Lokalita", score.location],
      ["Hypoteka", score.mortgage],
      ["Rust", score.growth],
      ["Likvidita", score.liquidity],
    ];

    const subX = M + 220;
    const subW = (W - M - subX - 10) / sub.length;
    sub.forEach(([lbl, val], i) => {
      const sx = subX + i * subW;
      const sRgb = scoreRGB(val);
      doc.save()
        .fillColor(C.slate600).font("Helvetica").fontSize(7)
        .text(t(lbl), sx, scoreY + 10, { width: subW - 4, align: "center", lineBreak: false })
        .restore();
      doc.save()
        .fillColor(sRgb).font("Helvetica-Bold").fontSize(14)
        .text(String(val), sx, scoreY + 22, { width: subW - 4, align: "center", lineBreak: false })
        .restore();
    });
  }

  // Cenové porovnání (tabulka)
  const tableY = scoreY + 84;
  const valuo = report.valuoEstimate;
  const localityMedian = report.localityStats?.medianPrice;

  const askDev = valuo.deviationPct;
  const localDev = listing.price && localityMedian
    ? Math.round(((listing.price - localityMedian) / localityMedian) * 10000) / 100
    : null;

  doc.save()
    .fillColor(C.black).font("Helvetica-Bold").fontSize(10)
    .text("Cenova analyza", M, tableY)
    .restore();

  drawTable(
    doc,
    M,
    tableY + 16,
    [
      ["Ukazatel", "Hodnota", "Odchylka"],
      ["Nabídkova cena", fmtKc(listing.price), "—"],
      [
        `Odhad Valuo (${t(valuo.source)})`,
        fmtKc(valuo.estimatedValue),
        askDev !== null ? fmtPct(-askDev) : "—",
      ],
      ["Median lokality", fmtKc(localityMedian ?? null), localDev !== null ? fmtPct(localDev) : "—"],
      ["Rozsah (Valuo)", `${fmtKc(valuo.rangeLow)} – ${fmtKc(valuo.rangeHigh)}`, "—"],
    ],
    [210, 155, 100]
  );

  // Interpretace odchylky
  const interpY = tableY + 16 + 5 * 20 + 10;
  if (askDev !== null) {
    const good = askDev >= 0;
    doc.save()
      .fillColor(good ? C.emerald : C.red)
      .font("Helvetica-Bold").fontSize(9)
      .text(
        good
          ? `Nabídková cena je o ${Math.abs(askDev).toFixed(1)} % pod tržním odhadem — VÝHODNA KOUPĚ`
          : `Nabídková cena je o ${Math.abs(askDev).toFixed(1)} % nad tržním odhadem — PREDRAZENO`,
        M, interpY, { width: W - M * 2 }
      )
      .restore();
  }

  drawFooter(doc, date);
}

function page2Scoring(
  doc: PDFKit.PDFDocument,
  report: EATReport,
  date: string
) {
  const W = doc.page.width;
  const M = 50;
  const score = report.score;

  drawHeader(doc, "Bodove hodnoceni — 5 dimenzí", 2, 4);

  let y = 58;

  doc.save()
    .fillColor(C.black).font("Helvetica-Bold").fontSize(12)
    .text("Scorecard — detailni hodnoceni", M, y)
    .restore();

  y += 20;
  doc.save()
    .fillColor(C.slate600).font("Helvetica").fontSize(9)
    .text("Celkove skore = váženy prumer 5 dimenzí − penalizace za rizika.", M, y, { width: W - M * 2 })
    .restore();

  y += 22;
  hline(doc, M, y, W - M * 2, C.slate200);
  y += 10;

  if (score) {
    const barW = 200;
    const dims: Array<[string, string, number]> = [
      ["Cena", "30 %", score.price],
      ["Lokalita", "25 %", score.location],
      ["Hypoteka (LTV, stav, energie)", "20 %", score.mortgage],
      ["Rustový potencial", "15 %", score.growth],
      ["Likvidita trhu", "10 %", score.liquidity],
    ];

    // Vizualizace dimenzí
    doc.save()
      .fillColor(C.slate600).font("Helvetica-Bold").fontSize(8)
      .text("DIMENZE", M, y, { lineBreak: false })
      .text("VAHA", M + 140, y, { lineBreak: false })
      .text("BAR", M + 176, y, { lineBreak: false })
      .text("SKORE", M + 176 + barW + 6, y, { lineBreak: false })
      .restore();

    y += 14;
    dims.forEach(([label, weight, val]) => {
      drawScoreBar(doc, M, y, barW, label, val, weight);
      y += 22;
    });

    y += 10;

    // Penalizace
    doc.save()
      .fillColor(C.black).font("Helvetica-Bold").fontSize(10)
      .text("Penalizace za rizika", M, y)
      .restore();

    y += 16;

    if (score.penalty > 0) {
      const FLAG_LABELS: Record<RiskFlag, [string, number]> = {
        COOPERATIVE_OWNERSHIP: ["Druzstevní vlastnictví", -15],
        PRICE_ABOVE_MARKET_30PCT: ["Cena >30 % nad mediánem", -20],
        MISSING_GPS: ["Chybí GPS souradnice", -10],
        GROUND_FLOOR_OR_BASEMENT: ["Prizemí nebo suterén", -8],
        POOR_ENERGY_LABEL: ["Nizka energeticka trida E–G", -10],
        ATYPICAL_DISPOSITION: ["Atypická dispozice", -5],
        LEGAL_ISSUE_DETECTED: ["Detekovany právní problém", -20],
        AUCTION: ["Drazba", -15],
        VERY_SHORT_DESCRIPTION: ["Velmi kratky popis", -5],
        STEEP_PRICE_DROP: ["Prudky pokles ceny >15 % / 30 dni", -8],
      };

      const penRows: Array<[string, string, string?]> = [
        ["Rizikový faktor", "Body"],
      ];
      score.flags.forEach((f) => {
        const [label, pts] = FLAG_LABELS[f] ?? [f, 0];
        penRows.push([t(label), `${pts} b.`]);
      });
      penRows.push(["CELKEM PENALIZACE", `−${score.penalty} b.`]);

      drawTable(doc, M, y, penRows, [300, 100]);
      y += penRows.length * 20 + 10;
    } else {
      doc.save()
        .fillColor(C.emerald).font("Helvetica-Bold").fontSize(9)
        .text("Zadne rizikove faktory detekovaní.", M, y)
        .restore();
      y += 20;
    }

    y += 10;

    // Legenda skóre
    doc.save()
      .fillColor(C.black).font("Helvetica-Bold").fontSize(10)
      .text("Interpretace skore", M, y)
      .restore();
    y += 16;

    const legend: Array<[[number,number,number], string, string]> = [
      [C.emerald, "80 – 100", "Výborna příležitost"],
      [C.green,   "60 – 79",  "Dobra nabídka"],
      [C.yellow,  "40 – 59",  "Prumerna nabídka"],
      [C.orange,  "20 – 39",  "Pod prumerem"],
      [C.red,     "0 – 19",   "Nevhodne"],
    ];
    legend.forEach(([rgb, range, label]) => {
      doc.save()
        .rect(M, y, 10, 10).fillColor(rgb).fill()
        .restore();
      doc.save()
        .fillColor(C.black).font("Helvetica").fontSize(8)
        .text(`${range}  —  ${t(label)}`, M + 16, y + 1, { lineBreak: false })
        .restore();
      y += 14;
    });
  } else {
    doc.save()
      .fillColor(C.slate600).font("Helvetica").fontSize(10)
      .text("Skore není k dispozici.", M, y)
      .restore();
  }

  drawFooter(doc, date);
}

function page3Market(
  doc: PDFKit.PDFDocument,
  report: EATReport,
  date: string
) {
  const W = doc.page.width;
  const M = 50;
  const listing = report.listing;
  const stats = report.localityStats;
  const valuo = report.valuoEstimate;

  drawHeader(doc, "Tržní analýza", 3, 4);

  let y = 58;

  doc.save()
    .fillColor(C.black).font("Helvetica-Bold").fontSize(12)
    .text("Trzní srovnání cen", M, y)
    .restore();
  y += 22;

  // Velká cenová porovnávací tabulka
  const priceRows: Array<[string, string, string?]> = [
    ["Ukazatel", "Hodnota", "vs. Nabídka"],
    ["Nabídkova cena", fmtKc(listing.price), "—"],
  ];

  if (valuo.estimatedValue) {
    const dev = valuo.deviationPct;
    priceRows.push([
      `Trzní odhad Valuo (spolehlivost: ${t(valuo.confidence)})`,
      fmtKc(valuo.estimatedValue),
      dev !== null ? fmtPct(-dev) : "—",
    ]);
    priceRows.push(["Dolní odhad Valuo", fmtKc(valuo.rangeLow), "—"]);
    priceRows.push(["Horní odhad Valuo", fmtKc(valuo.rangeHigh), "—"]);
  }

  if (stats) {
    const medDev = listing.price && stats.medianPrice
      ? Math.round(((listing.price - stats.medianPrice) / stats.medianPrice) * 10000) / 100
      : null;
    priceRows.push(["Median cen v lokalite", fmtKc(stats.medianPrice), medDev !== null ? fmtPct(medDev) : "—"]);
    priceRows.push(["Median Kc/m2 v lokalite", fmtKc(stats.medianPricePerM2), "—"]);
    priceRows.push(["Inzeratu v lokalite", String(stats.count), "—"]);
  }

  drawTable(doc, M, y, priceRows, [250, 130, 85]);
  y += priceRows.length * 20 + 20;

  // Vizuální gauge — relativní pozice ceny vůči odhadu
  if (valuo.estimatedValue && listing.price > 0) {
    const ratio = listing.price / valuo.estimatedValue;
    const barW = W - M * 2 - 60;
    const barH = 20;
    const bx = M;

    doc.save()
      .fillColor(C.black).font("Helvetica-Bold").fontSize(10)
      .text("Pozice nabídkové ceny vs. tržní odhad", M, y)
      .restore();
    y += 16;

    // Background
    doc.save()
      .rect(bx, y, barW, barH).fillColor(C.slate100).fill()
      .restore();

    // Odhad marker (střed)
    const centerX = Math.round(barW * 0.5);
    doc.save()
      .rect(bx + centerX - 1, y, 2, barH).fillColor(C.emerald).fill()
      .restore();

    // Nabídková cena marker
    const priceRatio = Math.min(Math.max(ratio, 0.7), 1.3);
    const priceX = Math.round(((priceRatio - 0.7) / 0.6) * barW);
    const priceColor = ratio > 1.1 ? C.red : ratio < 0.95 ? C.emerald : C.yellow;
    doc.save()
      .rect(bx + priceX - 3, y - 3, 6, barH + 6).fillColor(priceColor).fill()
      .restore();

    // Popisky
    y += barH + 8;
    doc.save()
      .fillColor(C.slate600).font("Helvetica").fontSize(7)
      .text("−30 %", M, y, { lineBreak: false })
      .text("Odhad", M + barW * 0.5 - 14, y, { lineBreak: false })
      .text("+30 %", M + barW - 20, y, { lineBreak: false })
      .restore();

    doc.save()
      .fillColor(priceColor).font("Helvetica-Bold").fontSize(8)
      .text(
        ratio > 1
          ? `Nabídka je o ${((ratio - 1) * 100).toFixed(1)} % DRAZSI nez tržní odhad`
          : `Nabídka je o ${((1 - ratio) * 100).toFixed(1)} % LEVNEJSI nez tržní odhad`,
        M, y + 14, { width: W - M * 2 }
      )
      .restore();
    y += 36;
  }

  // Locality stats detail
  if (stats) {
    y += 10;
    doc.save()
      .fillColor(C.black).font("Helvetica-Bold").fontSize(10)
      .text(`Statistiky lokality: ${t(stats.municipality)}`, M, y)
      .restore();
    y += 16;

    const statsRows: Array<[string, string, string?]> = [
      ["Statistika", "Hodnota"],
      ["Median ceny/m2", fmtKc(stats.medianPricePerM2)],
      ["Prumerna cena/m2", fmtKc(stats.meanPricePerM2)],
      ["Min. cena/m2", fmtKc(stats.minPricePerM2)],
      ["Max. cena/m2", fmtKc(stats.maxPricePerM2)],
      ["Pocet inzeratu v DB", String(stats.count)],
    ];

    if (listing.pricePerM2 && stats.medianPricePerM2) {
      const vs = Math.round(((listing.pricePerM2 - stats.medianPricePerM2) / stats.medianPricePerM2) * 10000) / 100;
      statsRows.push(["Cena/m2 tohoto inzerátu vs median", `${fmtKc(listing.pricePerM2)} (${fmtPct(vs)})`]);
    }

    drawTable(doc, M, y, statsRows, [280, 185]);
    y += statsRows.length * 20 + 10;
  }

  drawFooter(doc, date);
}

function page4Address(
  doc: PDFKit.PDFDocument,
  report: EATReport,
  date: string
) {
  const W = doc.page.width;
  const M = 50;
  const listing = report.listing;
  const ruian = report.ruian;

  drawHeader(doc, "Adresa, katastry a doporucení", 4, 4);

  let y = 58;

  // RÚIAN
  doc.save()
    .fillColor(C.black).font("Helvetica-Bold").fontSize(12)
    .text("Adresní ověření (RÚIAN / Nominatim)", M, y)
    .restore();
  y += 22;

  const ruianRows: Array<[string, string]> = [
    ["Ukazatel", "Hodnota"],
    ["Status", ruian.found ? "Adresa nalezena" : "Adresa neoverena"],
    ["Oficíální adresa", t(ruian.officialAddress ?? "—")],
    ["Obec", t(ruian.municipality ?? "—")],
    ["Okres", t(ruian.district ?? "—")],
    ["PSC", ruian.postalCode ?? "—"],
    ["GPS", ruian.lat ? `${ruian.lat.toFixed(5)}, ${ruian.lng?.toFixed(5)}` : "—"],
    ["Zdroj", ruian.source],
  ];

  drawTable(doc, M, y, ruianRows, [220, 245]);
  y += ruianRows.length * 20 + 10;

  // GPS mapa odkaz
  if (listing.gpsLat && listing.gpsLng) {
    doc.save()
      .fillColor(C.blue600).font("Helvetica").fontSize(8)
      .text(
        `Zobrazit na mape: mapy.cz/?x=${listing.gpsLng}&y=${listing.gpsLat}&z=16`,
        M, y, { width: W - M * 2 }
      )
      .restore();
    y += 20;
  }

  // MHD dostupnost
  y += 10;
  doc.save()
    .fillColor(C.black).font("Helvetica-Bold").fontSize(12)
    .text("Dostupnost MHD (Golemio)", M, y)
    .restore();
  y += 16;

  const mhdRows: Array<[string, string]> = [
    ["Dopravní ukazatel", "Hodnota"],
    ["Metro (min. chuze)", listing.metroWalkMinutes !== null ? `${listing.metroWalkMinutes} min` : "Nedostupne"],
    ["Nejblizsi MHD (min. chuze)", listing.mhdWalkMinutes !== null ? `${listing.mhdWalkMinutes} min` : "Nedostupne"],
  ];

  drawTable(doc, M, y, mhdRows, [280, 185]);
  y += mhdRows.length * 20 + 20;

  // Advisorovy poznámky
  if (report.advisorNotes) {
    doc.save()
      .fillColor(C.black).font("Helvetica-Bold").fontSize(12)
      .text("Poznámky poradce", M, y)
      .restore();
    y += 16;
    doc.save()
      .rect(M, y, W - M * 2, 60).fillColor(C.slate50)
      .strokeColor(C.slate200).lineWidth(0.8).fillAndStroke()
      .restore();
    doc.save()
      .fillColor(C.black).font("Helvetica").fontSize(9)
      .text(t(report.advisorNotes), M + 10, y + 10, {
        width: W - M * 2 - 20,
        height: 40,
      })
      .restore();
    y += 74;
  }

  // Celkové doporučení
  y += 4;
  doc.save()
    .fillColor(C.black).font("Helvetica-Bold").fontSize(12)
    .text("Celkove doporucení", M, y)
    .restore();
  y += 16;

  const score = report.score;
  if (score) {
    const rgb = scoreRGB(score.total);
    doc.save()
      .rect(M, y, W - M * 2, 52).fillColor(rgb as unknown as string)
      .fillOpacity(0.1).fill().fillOpacity(1)
      .strokeColor(rgb).lineWidth(1.5).stroke()
      .restore();

    doc.save()
      .fillColor(rgb).font("Helvetica-Bold").fontSize(24)
      .text(String(score.total), M + 16, y + 10, { lineBreak: false })
      .restore();

    doc.save()
      .fillColor(rgb).font("Helvetica-Bold").fontSize(13)
      .text(t(score.label), M + 62, y + 14, { lineBreak: false })
      .restore();

    if (score.flags.length > 0) {
      doc.save()
        .fillColor(C.slate600).font("Helvetica").fontSize(8)
        .text(
          `Pozor: ${score.flags.length} rizikovy${score.flags.length > 1 ? "ch" : ""} faktor${score.flags.length > 1 ? "u" : ""}`,
          M + 62, y + 30, { lineBreak: false }
        )
        .restore();
    }

    y += 66;
  }

  // Compliance disclaimer
  y = Math.max(y, doc.page.height - 80);
  hline(doc, M, y, W - M * 2, C.slate200);
  y += 8;
  doc.save()
    .fillColor(C.slate400).font("Helvetica").fontSize(7)
    .text(
      "UPOZORNENÍ: Tento report má pouze informativní charakter a nepredstavuje investicní poradenství. " +
      "RealAdvisor neukládá fotografie ani plne texty inzerátů. Poradce je povinen overit aktuální stav " +
      "na zdrojovém portálu a v katastru nemovitostí. Odhad Valuo je orientacní.",
      M, y, { width: W - M * 2 }
    )
    .restore();

  drawFooter(doc, date);
}

// ---------------------------------------------------------------------------
// Hlavní export
// ---------------------------------------------------------------------------

export async function generateReport(report: EATReport): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const options: PDFKit.PDFDocumentOptions = {
      size: "A4",
      margin: 50,
      info: {
        Title: `RealAdvisor Report — ${report.listing.title}`,
        Author: "RealAdvisor",
        Subject: "Analyticke hodnocení nemovitosti",
        Creator: "RealAdvisor PDF Generator v1.0",
      },
      autoFirstPage: false,
    };

    // Volitelný custom font (musí podporovat Latin-2)
    const fontPath = process.env.REPORT_FONT_PATH;

    const doc = new PDFDocument(options);

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (fontPath) {
      try {
        doc.registerFont("Custom", fontPath);
        doc.registerFont("Custom-Bold", fontPath);
      } catch {
        // Ignorovat chybu registrace fontu — fallback na Helvetica
      }
    }

    const date = new Date().toLocaleString("cs-CZ", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

    // Stránka 1 — shrnutí + cenová analýza
    doc.addPage();
    page1Cover(doc, report, date);

    // Stránka 2 — scoring breakdown
    doc.addPage();
    page2Scoring(doc, report, date);

    // Stránka 3 — tržní analýza
    doc.addPage();
    page3Market(doc, report, date);

    // Stránka 4 — adresa + RÚIAN + doporučení
    doc.addPage();
    page4Address(doc, report, date);

    doc.end();
  });
}
