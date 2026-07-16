import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { MacroService } from "./macro.service";
import { MACRO_CONFIG } from "./macro.config";

/**
 * Keeps the macro calendar fresh, and raises the one-time warning before a
 * high-impact release.
 *
 * The calendar barely changes, so it refreshes hourly. Separately, once a minute,
 * it checks whether a HIGH-impact event has crossed into the warning window and, if
 * so, emits `macro.event.imminent` exactly once — the notification engine turns
 * that into an alert. It emits an EVENT rather than calling the notifier, so it
 * never learns the notification engine exists (AGENTS.md §5).
 */
@Injectable()
export class MacroWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(MacroWorker.name);
  private warned = new Set<string>();

  constructor(
    private readonly macro: MacroService,
    private readonly events: EventEmitter2,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.macro.refresh().catch((error) => this.logger.warn({ err: error }, "initial macro refresh failed"));
  }

  @Interval(MACRO_CONFIG.refreshIntervalMs)
  async refresh(): Promise<void> {
    try {
      await this.macro.refresh();
    } catch (error) {
      this.logger.warn({ err: error }, "macro refresh failed — keeping the last calendar");
    }
  }

  @Interval(60_000)
  checkImminent(): void {
    if (!this.macro.hasData()) return;

    const next = this.macro.nextHighImpact();
    if (!next) return;

    const minutesUntil = Math.round((Date.parse(next.time) - Date.now()) / 60_000);
    if (minutesUntil < 0 || minutesUntil > MACRO_CONFIG.imminentMinutes) return;
    if (this.warned.has(next.id)) return;

    this.warned.add(next.id);
    this.events.emit("macro.event.imminent", {
      title: next.title,
      minutesUntil,
      impact: next.impact,
    });
    this.logger.log(`Macro warning: ${next.title} in ~${minutesUntil} min`);
  }
}
