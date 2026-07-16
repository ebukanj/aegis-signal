import { Injectable, Logger } from "@nestjs/common";
import type { EconomicCalendar, EconomicEvent, MacroWindow } from "@aegis/contracts";

import { FmpCalendarProvider } from "./macro.provider";
import { MacroInterpreter } from "./macro.interpreter";
import { fomcEvents, MACRO_CONFIG } from "./macro.config";

/**
 * The macro read of the market, in one place.
 *
 * It composes the built-in FOMC schedule with the live provider (when a key is
 * set), interprets any printed release, and answers the two questions the rest of
 * the platform asks: *what is coming, and are we in a window to stand down right
 * now?* It holds the calendar in memory (the worker refreshes it) so the hot path
 * — "is a macro window open?" — never touches I/O.
 */
@Injectable()
export class MacroService {
  private readonly logger = new Logger(MacroService.name);
  private events: EconomicEvent[] = [];
  private lastRefresh = 0;

  constructor(
    private readonly fmp: FmpCalendarProvider,
    private readonly interpreter: MacroInterpreter,
  ) {}

  /** Pull the latest calendar from every source and cache it. */
  async refresh(now = Date.now()): Promise<void> {
    const from = new Date(now - MACRO_CONFIG.lookbackHours * 3_600_000).toISOString();
    const to = new Date(now + MACRO_CONFIG.lookaheadDays * 86_400_000).toISOString();

    // Built-in FOMC schedule is always present; the live provider adds the rest.
    const provided = this.fmp.available() ? await this.fmp.fetch(from, to) : [];

    // De-duplicate: a provider FOMC entry (with numbers) supersedes the built-in
    // placeholder for the same day.
    const byDay = new Map<string, EconomicEvent>();
    for (const event of [...fomcEvents(), ...provided]) {
      const key = `${event.category}:${event.time.slice(0, 10)}`;
      const existing = byDay.get(key);
      // Prefer the richer entry (one that carries a forecast/actual).
      if (!existing || (event.forecast ?? event.actual)) byDay.set(key, event);
    }

    this.events = [...byDay.values()]
      .map((e) => ({ ...e, interpretation: this.interpreter.interpret(e) }))
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

    this.lastRefresh = now;
    this.logger.log(
      `Macro calendar refreshed: ${this.events.length} events (${this.fmp.available() ? "live provider" : "built-in FOMC only"})`,
    );
  }

  /** Is a HIGH-impact event imminent or just printed? The hot-path check. */
  window(now = Date.now()): MacroWindow {
    const windowMs = MACRO_CONFIG.windowMinutes * 60_000;

    for (const event of this.events) {
      if (event.impact !== "HIGH") continue;
      const delta = Date.parse(event.time) - now;
      if (Math.abs(delta) <= windowMs) {
        return { active: true, event, minutesUntil: Math.round(delta / 60_000) };
      }
    }
    return { active: false, event: null, minutesUntil: null };
  }

  /** The full calendar for the Insights page. */
  calendar(now = Date.now()): EconomicCalendar {
    const upcoming = this.events.filter((e) => Date.parse(e.time) >= now);
    const recent = this.events
      .filter((e) => Date.parse(e.time) < now)
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));

    return {
      upcoming,
      recent,
      window: this.window(now),
      source: this.fmp.available() ? "PROVIDER" : "BUILTIN",
      generatedAt: new Date(now).toISOString(),
    };
  }

  /** The next HIGH-impact event, for the imminent-warning worker. */
  nextHighImpact(now = Date.now()): EconomicEvent | null {
    return this.events.find((e) => e.impact === "HIGH" && Date.parse(e.time) >= now) ?? null;
  }

  hasData(): boolean {
    return this.lastRefresh > 0;
  }
}
