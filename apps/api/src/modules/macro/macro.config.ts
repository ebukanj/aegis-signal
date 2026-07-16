import type { EconomicEvent } from "@aegis/contracts";

/**
 * The built-in FOMC schedule — real value with zero dependencies.
 *
 * The Fed publishes its meeting calendar a year ahead, and the rate decision is
 * the single highest-impact scheduled event for crypto. So the platform ships the
 * schedule: even with no data-provider key, it knows when to raise a macro window
 * and stand the trader down. The 2pm ET announcement is expressed in UTC (EST is
 * UTC-5, EDT UTC-4).
 *
 * ── This list is data, and it goes stale ──
 *
 * These are the 2026 dates. Update them each year, OR set
 * `ECONOMIC_CALENDAR_API_KEY` and the live provider supersedes this entirely with
 * the full calendar (CPI, NFP, PCE) including forecasts and actuals. The built-in
 * is the floor, never the ceiling.
 */
export const FOMC_2026_UTC: string[] = [
  "2026-01-28T19:00:00Z",
  "2026-03-18T18:00:00Z",
  "2026-04-29T18:00:00Z",
  "2026-06-17T18:00:00Z",
  "2026-07-29T18:00:00Z",
  "2026-09-16T18:00:00Z",
  "2026-10-28T18:00:00Z",
  "2026-12-09T19:00:00Z",
];

export function fomcEvents(): EconomicEvent[] {
  return FOMC_2026_UTC.map((iso) => ({
    id: `fomc:${iso.slice(0, 10)}`,
    title: "FOMC Interest Rate Decision",
    country: "US",
    category: "RATES" as const,
    impact: "HIGH" as const,
    time: iso,
    forecast: null,
    previous: null,
    actual: null,
    interpretation: null,
    source: "FOMC schedule",
  }));
}

export const MACRO_CONFIG = {
  /**
   * How wide the "stand down" window is around a HIGH-impact release, in minutes.
   * Volatility spikes just before and whips for a while after; 30 minutes either
   * side is a conservative, honest guard.
   */
  windowMinutes: 30,
  /** Warn the trader this many minutes before a HIGH-impact event. Once per event. */
  imminentMinutes: 30,
  /** How often the worker refreshes the calendar from its providers. */
  refreshIntervalMs: 60 * 60 * 1000, // hourly — the calendar barely changes
  /** How far ahead to surface events. */
  lookaheadDays: 21,
  /** How far back to keep printed events (with their interpretation). */
  lookbackHours: 24,
} as const;
