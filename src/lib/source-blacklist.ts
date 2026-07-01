// Blacklist zdrojů — compliance §2 "Implementuji opt-out (blacklist zdrojů)"

const BLACKLISTED_DOMAINS = new Set<string>([
  // Portály, které explicitně zakázaly scraping ve smluvních podmínkách:
  // "example-blocked-portal.cz",
]);

/** Vrátí true pokud je doména na blacklistu. */
export function isBlacklisted(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return BLACKLISTED_DOMAINS.has(hostname.replace(/^www\./, ""));
  } catch {
    return false;
  }
}

/** Přidá doménu do runtime blacklistu (resetuje se při restartu serveru). */
export function addToBlacklist(domain: string): void {
  BLACKLISTED_DOMAINS.add(domain.replace(/^www\./, ""));
}

/** Vrátí aktuální seznam blokovaných domén. */
export function getBlacklist(): string[] {
  return [...BLACKLISTED_DOMAINS];
}
