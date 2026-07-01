// Parser přirozeného jazyka pro vyhledávání nemovitostí
// Primárně: OpenAI GPT-4o (vyžaduje OPENAI_API_KEY)
// Fallback: regex parser bez externích závislostí

export interface ParsedQuery {
  disposition: string | null;     // "3+kk", "2+1" apod.
  municipality: string | null;    // "Praha 4", "Brno" apod.
  maxPriceKc: number | null;
  minAreaM2: number | null;
  maxAreaM2: number | null;
  maxMhdMinutes: number | null;
  ownershipType: "OV" | "DV" | null;
  raw: string;
  method: "ai" | "regex";
}

// ---------------------------------------------------------------------------
// Regex fallback parser
// ---------------------------------------------------------------------------

const DISPOSITION_RE = /\b(\d\s*[+]\s*(?:kk|\d))\b/i;
const PRICE_RE = /do\s+(\d[\d\s]*)\s*(mil(?:ion)?\.?|kč|,-|tis(?:íc)?\.?)/i;
const MHD_RE = /(?:mhd|metro|tramvaj)\s+(?:do|max\.?)\s+(\d+)\s*min/i;
const AREA_MIN_RE = /(?:od|alespoň)\s+(\d+)\s*m[²2]/i;
const AREA_MAX_RE = /(?:do|max(?:imálně)?\.?)\s+(\d+)\s*m[²2]/i;
const OV_RE = /\b(?:OV|osobní vlastnictví|vlastní|vlastnictví)\b/i;
const DV_RE = /\b(?:DV|družstev(?:ní|o)?)\b/i;

// Největší known municipality patterns (seřazeny od delšího k kratšímu)
const MUNICIPALITIES = [
  "Praha 10", "Praha 11", "Praha 12", "Praha 13", "Praha 14",
  "Praha 15", "Praha 1", "Praha 2", "Praha 3", "Praha 4",
  "Praha 5", "Praha 6", "Praha 7", "Praha 8", "Praha 9",
  "Praha",
  "Brno-střed", "Brno",
  "Ostrava",
  "Plzeň",
  "Liberec",
  "Olomouc",
  "Pardubice",
  "Hradec Králové",
  "České Budějovice",
  "Ústí nad Labem",
  "Zlín",
  "Jihlava",
];

function parseWithRegex(query: string): ParsedQuery {
  const dispMatch = query.match(DISPOSITION_RE);
  const disposition = dispMatch
    ? dispMatch[1].replace(/\s+/g, "").toLowerCase()
    : null;

  // Municipalita — hledáme od nejdelšího vzoru
  let municipality: string | null = null;
  for (const m of MUNICIPALITIES) {
    if (query.toLowerCase().includes(m.toLowerCase())) {
      municipality = m;
      break;
    }
  }

  // Cena
  let maxPriceKc: number | null = null;
  const priceMatch = query.match(PRICE_RE);
  if (priceMatch) {
    const num = parseInt(priceMatch[1].replace(/\s/g, ""), 10);
    const unit = priceMatch[2].toLowerCase();
    if (unit.startsWith("mil")) maxPriceKc = num * 1_000_000;
    else if (unit.startsWith("tis")) maxPriceKc = num * 1_000;
    else maxPriceKc = num;
  }

  const mhdMatch = query.match(MHD_RE);
  const maxMhdMinutes = mhdMatch ? parseInt(mhdMatch[1], 10) : null;

  const areaMinMatch = query.match(AREA_MIN_RE);
  const minAreaM2 = areaMinMatch ? parseInt(areaMinMatch[1], 10) : null;

  const areaMaxMatch = query.match(AREA_MAX_RE);
  const maxAreaM2 = areaMaxMatch ? parseInt(areaMaxMatch[1], 10) : null;

  const ownershipType = OV_RE.test(query) ? "OV" : DV_RE.test(query) ? "DV" : null;

  return {
    disposition,
    municipality,
    maxPriceKc,
    minAreaM2,
    maxAreaM2,
    maxMhdMinutes,
    ownershipType,
    raw: query,
    method: "regex",
  };
}

// ---------------------------------------------------------------------------
// OpenAI GPT-4o parser
// ---------------------------------------------------------------------------

async function parseWithAI(query: string): Promise<ParsedQuery> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY není nastaven.");

  const systemPrompt = `Jsi asistent pro parsování dotazů na nemovitosti.
Vrať POUZE validní JSON bez markdown bloků. Extrahuj pole:
- disposition: string | null (např. "3+kk", "2+1")
- municipality: string | null (obec nebo část, např. "Praha 4", "Brno")
- maxPriceKc: number | null (celé Kč)
- minAreaM2: number | null
- maxAreaM2: number | null
- maxMhdMinutes: number | null (max. chůze na MHD v minutách)
- ownershipType: "OV" | "DV" | null
Pokud není hodnota zmíněna, dej null.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0,
      max_tokens: 300,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);

  interface OAIResponse {
    choices: Array<{
      message: { content: string };
    }>;
  }

  const json = (await res.json()) as OAIResponse;
  const content = json.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as Omit<ParsedQuery, "raw" | "method">;
  return { ...parsed, raw: query, method: "ai" };
}

// ---------------------------------------------------------------------------
// Veřejná funkce
// ---------------------------------------------------------------------------

export async function parseSearchQuery(query: string): Promise<ParsedQuery> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      disposition: null, municipality: null, maxPriceKc: null,
      minAreaM2: null, maxAreaM2: null, maxMhdMinutes: null,
      ownershipType: null, raw: trimmed, method: "regex",
    };
  }

  try {
    return await parseWithAI(trimmed);
  } catch {
    return parseWithRegex(trimmed);
  }
}

/** Filtruje listings podle ParsedQuery. */
export function filterByQuery<T extends {
  disposition?: string | null;
  municipality?: string | null;
  price: number;
  pricePerM2?: number | null;
  usableArea?: number | null;
  mhdWalkMinutes?: number | null;
  ownershipType?: string | null;
}>(listings: T[], q: ParsedQuery): T[] {
  return listings.filter((l) => {
    if (q.disposition && l.disposition) {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
      if (!norm(l.disposition).includes(norm(q.disposition))) return false;
    }
    if (q.municipality && l.municipality) {
      if (!l.municipality.toLowerCase().includes(q.municipality.toLowerCase())) return false;
    }
    if (q.maxPriceKc && l.price > q.maxPriceKc) return false;
    if (q.minAreaM2 && l.usableArea && l.usableArea < q.minAreaM2) return false;
    if (q.maxAreaM2 && l.usableArea && l.usableArea > q.maxAreaM2) return false;
    if (q.maxMhdMinutes && l.mhdWalkMinutes && l.mhdWalkMinutes > q.maxMhdMinutes) return false;
    if (q.ownershipType && l.ownershipType && l.ownershipType !== q.ownershipType) return false;
    return true;
  });
}
