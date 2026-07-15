import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { EventEmitter2 } from "@nestjs/event-emitter";

import { LedgerService } from "../services/ledger.service";
import { calculateOutcome } from "./outcome.calculator";
import { SignalService } from "../../../signals/application/services/signal.service";
import { MarketService } from "../../../market/application/market.service";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";
import type { LedgerEntry, SignalStatus } from "@aegis/contracts";

/**
 * The heartbeat that makes the feed LIVE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A SIGNAL IS SETTLED BY THE MARKET, NOT BY A REFRESH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The owner's requirement, exactly: a missed or stopped-out signal must leave the
 * feed on its own, not when someone reloads the page. This worker is what delivers
 * that. On a fixed interval it walks every OPEN signal, fetches the price path
 * since it was published, and asks the outcome calculator what happened. If the
 * trade resolved — hit a target, hit its stop, ran past its entry and never
 * triggered, or aged out — the ledger settles it (immutably), the Signal Engine
 * advances its lifecycle to a terminal state, and a `signals.changed` event tells
 * the browser to update. The signal drops out of the active feed without anyone
 * touching anything.
 *
 * It is deterministic: the same price path always produces the same settlement, so
 * a replay of a day settles it exactly as it happened.
 */
@Injectable()
export class SettlementWorker {
  private readonly logger = new Logger(SettlementWorker.name);
  private running = false;

  constructor(
    private readonly ledger: LedgerService,
    private readonly signals: SignalService,
    private readonly market: MarketService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Every 30 seconds. Fast enough that a resolved trade leaves the feed while the
   * trader is still looking at it; slow enough that it is not hammering the
   * exchange for a hundred symbols a second.
   */
  @Interval(30_000)
  async sweep(): Promise<void> {
    if (this.running) return; // never overlap — a slow fetch must not stack passes
    this.running = true;
    try {
      await this.settleOpen();
    } catch (error) {
      this.logger.error({ err: error }, "Settlement sweep failed");
    } finally {
      this.running = false;
    }
  }

  private async settleOpen(): Promise<void> {
    const open = await this.ledger.open();
    if (open.length === 0) return;

    let settled = 0;
    let changed = false;

    /* Group by symbol so we fetch each market's candles once. */
    const bySymbol = new Map<string, LedgerEntry[]>();
    for (const entry of open) {
      (bySymbol.get(entry.symbol) ?? bySymbol.set(entry.symbol, []).get(entry.symbol)!).push(entry);
    }

    for (const [symbol, entries] of bySymbol) {
      const timeframe = entries[0].timeframe;
      let candles;
      try {
        candles = await this.market.candles({ symbol, timeframe, limit: 400 });
      } catch {
        continue; // a symbol we cannot fetch right now stays open; try again next sweep
      }

      for (const entry of entries) {
        const barMs = timeframeMs(entry.timeframe);
        const future = candles.filter((c) => c.time >= entry.barTime);
        if (future.length === 0) continue;

        const maxBarsToResolve = 72;
        const maxBarsToTrigger = 8;

        /*
         * Compute the outcome FIRST, and only settle if it is definitive for where
         * we are now. The calculator always returns something (it force-expires at
         * the horizon), so settling unconditionally would prematurely close a live
         * trade that simply has not resolved yet — and settlement is immutable, so
         * a premature close could never be undone.
         */
        const candidate = calculateOutcome({
          direction: entry.direction,
          entryPrice: entry.entryPrice,
          stopLoss: entry.stopLoss,
          takeProfits: entry.takeProfits,
          publishedAt: entry.publishedAt,
          future,
          maxBarsToTrigger,
          maxBarsToResolve,
          barMs,
        });

        const elapsedBars = Math.floor((Date.now() - entry.publishedAt) / barMs);
        const definitive =
          candidate.exitReason === "STOP_LOSS" ||
          candidate.exitReason.startsWith("TARGET") ||
          (candidate.exitReason === "NEVER_TRIGGERED" && elapsedBars >= maxBarsToTrigger) ||
          (candidate.exitReason === "EXPIRY" && elapsedBars >= maxBarsToResolve);

        if (!definitive) continue; // still genuinely open — leave it

        const settlement = await this.ledger.settleWith(entry.signalId, candidate);
        if (!settlement) continue; // lost a race — already settled

        settled += 1;
        changed = true;

        /* Advance the signal's lifecycle to the matching terminal state so the feed
         * (which reads signal status) drops it. */
        const to = terminalStatus(settlement.exitReason);
        const triggered = settlement.triggeredAt !== null;
        await this.advance(entry.signalId, to, triggered, settlement.settledAt).catch((e) =>
          this.logger.warn(`Could not advance ${entry.signalId}: ${(e as Error).message}`),
        );
      }
    }

    if (changed) {
      this.logger.log(`Settled ${settled} open signal(s) this sweep`);
      /* Tell the browser to update — the feed re-ranks and drops settled signals
       * without a refresh. */
      this.events.emit("signals.changed", { settled });
    }
  }

  /** Move ACTIVE → (TRIGGERED) → terminal, respecting the lifecycle state machine. */
  private async advance(
    signalId: string,
    to: SignalStatus,
    triggered: boolean,
    at: number,
  ): Promise<void> {
    const signal = await this.signals.byId(signalId);
    if (!signal || signal.status !== "ACTIVE") return;

    if (triggered && to !== "EXPIRED") {
      /* It entered, then hit a target or the stop. */
      await this.signals.advance(signalId, "TRIGGERED", "price reached the entry", at - 1);
      await this.signals.advance(signalId, to, `settled at ${to}`, at);
    } else {
      /* Never entered, or entered and ran out its clock → EXPIRED from ACTIVE. */
      await this.signals.advance(signalId, "EXPIRED", "settled without resolving", at);
    }
  }
}

function terminalStatus(exitReason: string): SignalStatus {
  if (exitReason === "STOP_LOSS") return "STOPPED";
  if (exitReason.startsWith("TARGET")) return "COMPLETED";
  return "EXPIRED";
}
