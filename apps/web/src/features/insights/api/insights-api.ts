import type { InsightsFeed } from "@aegis/contracts";
import { apiGet } from "@/lib/api";

/**
 * Insights data access — LIVE.
 *
 * News and risk flags come from the Insights Engine (M12), collected from real
 * crypto-news sources and classified deterministically. Social intelligence and
 * on-chain fundamentals are architecture-only this milestone — no live source yet
 * — so the API returns them empty and the page shows an honest "not live" state
 * rather than fabricated chatter. The market summary is a DETERMINISTIC context
 * line (model: "deterministic"), never an AI one; the AI layer is a later service.
 */
export const insightsApi = {
  getFeed: (): Promise<InsightsFeed> => apiGet<InsightsFeed>("/insights"),
};
