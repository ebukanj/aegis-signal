import { Injectable, Logger } from "@nestjs/common";
import type { EconomicEvent, MacroCategory, MacroImpact } from "@aegis/contracts";

import { AppConfigService } from "../../config/app-config.service";

/**
 * The live economic-calendar provider — Financial Modeling Prep's free tier.
 *
 * Optional: with no `ECONOMIC_CALENDAR_API_KEY` it reports `available() === false`
 * and the platform runs on the built-in FOMC schedule alone. With a key it fetches
 * the full high-impact US calendar — CPI, NFP, PCE, the rate decision — including
 * forecasts and, after release, actuals, which is what lets the interpreter read
 * the surprise.
 *
 * It never throws for an expected failure; a network blip returns an empty list and
 * the built-in schedule carries on.
 */
@Injectable()
export class FmpCalendarProvider {
  private readonly logger = new Logger(FmpCalendarProvider.name);

  constructor(private readonly config: AppConfigService) {}

  available(): boolean {
    return Boolean(this.config.macro.calendarApiKey);
  }

  async fetch(fromIso: string, toIso: string): Promise<EconomicEvent[]> {
    const key = this.config.macro.calendarApiKey;
    if (!key) return [];

    const from = fromIso.slice(0, 10);
    const to = toIso.slice(0, 10);
    const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${key}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12_000) });
      if (!response.ok) {
        this.logger.warn(`economic_calendar → ${response.status}`);
        return [];
      }
      const rows = (await response.json()) as FmpRow[];
      if (!Array.isArray(rows)) return [];

      return rows
        // The whole market trades the US number; the rest is noise for a crypto desk.
        .filter((r) => (r.country === "US" || r.currency === "USD") && r.impact === "High")
        .map((r) => this.map(r))
        .filter((e): e is EconomicEvent => e !== null);
    } catch (error) {
      this.logger.debug({ err: error }, "economic_calendar fetch failed");
      return [];
    }
  }

  private map(row: FmpRow): EconomicEvent | null {
    if (!row.date || !row.event) return null;
    // FMP dates are naive US/Eastern; append the offset so they parse as an instant.
    const time = new Date(row.date.replace(" ", "T") + "Z").toISOString();

    return {
      id: `fmp:${row.event}:${row.date}`.replace(/\s+/g, "_"),
      title: row.event,
      country: row.country ?? "US",
      category: categorise(row.event),
      impact: (row.impact?.toUpperCase() as MacroImpact) ?? "MEDIUM",
      time,
      forecast: numOrNull(row.estimate),
      previous: numOrNull(row.previous),
      actual: numOrNull(row.actual),
      interpretation: null, // filled by the interpreter downstream
      source: "Financial Modeling Prep",
    };
  }
}

interface FmpRow {
  event?: string;
  date?: string;
  country?: string;
  currency?: string;
  actual?: number | string | null;
  estimate?: number | string | null;
  previous?: number | string | null;
  impact?: string;
}

function numOrNull(v: number | string | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function categorise(event: string): MacroCategory {
  const e = event.toLowerCase();
  if (/(cpi|pce|ppi|inflation|price index)/.test(e)) return "INFLATION";
  if (/(fed|fomc|interest rate|rate decision)/.test(e)) return "RATES";
  if (/(nonfarm|payroll|unemployment|jobless|employment)/.test(e)) return "EMPLOYMENT";
  if (/(gdp|retail sales|pmi|manufacturing|growth)/.test(e)) return "GROWTH";
  return "OTHER";
}
