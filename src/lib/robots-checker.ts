const cache = new Map<string, { disallowed: string[]; fetchedAt: number }>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1_000; // 4 hodiny dle compliance checklist
const UA = "RealAdvisorBot/1.0 (+https://realadvisor.internal/bot)";

export async function isAllowedByRobots(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const disallowed = await getDisallowedPaths(parsed.origin);
  return !disallowed.some((rule) => parsed.pathname.startsWith(rule));
}

async function getDisallowedPaths(origin: string): Promise<string[]> {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.disallowed;
  }

  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      cache.set(origin, { disallowed: [], fetchedAt: Date.now() });
      return [];
    }

    const text = await res.text();
    const disallowed = parseDisallowed(text);
    cache.set(origin, { disallowed, fetchedAt: Date.now() });
    return disallowed;
  } catch {
    // Fail open — pokud robots.txt není dostupný, povolíme
    return [];
  }
}

function parseDisallowed(text: string): string[] {
  const disallowed: string[] = [];
  let applicable = false;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();

    if (key === "user-agent") {
      applicable = val === "*" || val.toLowerCase().includes("realadvisorbot");
    } else if (applicable && key === "disallow" && val) {
      disallowed.push(val.toLowerCase());
    }
  }

  return disallowed;
}
