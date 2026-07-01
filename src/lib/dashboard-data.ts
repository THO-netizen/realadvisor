import type { Listing } from "@/components/dashboard/TopOpportunities";
import type { PriceAlarm } from "@/components/dashboard/PriceAlarms";
import type { WatchlistEntry } from "@/components/dashboard/WatchlistSummary";

export interface DashboardStats {
  newListingsToday: number;
  newListingsBySource: Record<string, number>;
  topListings: Listing[];
  priceAlarms: PriceAlarm[];
  watchlistEntries: WatchlistEntry[];
  pipelineStats: Record<string, number>;
}

/**
 * Fetches dashboard statistics from the backend API.
 * Returns empty/zero state when the backend is not yet connected (Phase 1 scaffold).
 */
export async function getDashboardStats(
  apiUrl: string,
  authToken?: string
): Promise<DashboardStats> {
  const emptyState: DashboardStats = {
    newListingsToday: 0,
    newListingsBySource: {},
    topListings: [],
    priceAlarms: [],
    watchlistEntries: [],
    pipelineStats: {
      new: 0,
      sent: 0,
      interested: 0,
      viewing: 0,
      rejected: 0,
      archived: 0,
    },
  };

  if (!apiUrl || apiUrl.includes("localhost:3001")) {
    return emptyState;
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const res = await fetch(`${apiUrl}/analytics/dashboard`, {
      headers,
      next: { revalidate: 300 },
    });

    if (!res.ok) return emptyState;
    return await res.json();
  } catch {
    return emptyState;
  }
}
