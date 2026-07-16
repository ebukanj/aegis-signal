import { apiGet, apiSend } from "@/lib/api";
import type { AddToWatchlistRequest } from "@aegis/contracts";

/**
 * Watchlist data access — LIVE (M17). A user's watched coins, stored with their
 * account. The platform scans these as priority every sweep, so an opportunity on
 * a coin you care about is never missed for want of scan budget.
 */
export const watchlistApi = {
  get: (): Promise<string[]> => apiGet<string[]>("/auth/me/watchlist"),

  add: (coin: string): Promise<string[]> =>
    apiSend<string[]>("/auth/me/watchlist", { coin } satisfies AddToWatchlistRequest),

  remove: (coin: string): Promise<string[]> =>
    apiSend<string[]>(`/auth/me/watchlist/${encodeURIComponent(coin)}`, undefined, "DELETE"),
};
