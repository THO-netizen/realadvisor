// Module-level Map survives within a single Node.js process (dev server).
// In production with multiple workers, use Redis instead.
const lastRequestAt = new Map<string, number>();

export async function enforceRateLimit(
  domain: string,
  minIntervalMs = 2_000
): Promise<void> {
  const now = Date.now();
  const last = lastRequestAt.get(domain) ?? 0;
  const wait = minIntervalMs - (now - last);

  if (wait > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, wait));
  }

  lastRequestAt.set(domain, Date.now());
}
