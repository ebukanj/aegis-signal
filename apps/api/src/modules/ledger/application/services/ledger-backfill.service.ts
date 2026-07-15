import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { ExitReason, LabelledSetup, OutcomeType, Settlement } from "@aegis/contracts";

import { CalibrationRepository } from "../../../confidence/infrastructure/repository/calibration.repository";
import { LedgerService } from "./ledger.service";
import { LedgerRepository } from "../../infrastructure/repository/ledger.repository";
import { SignalRepository } from "../../../signals/infrastructure/repository/signal.repository";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

/**
 * Settles the historical, backfilled signals from their KNOWN outcomes.
 *
 * ── Why the outcome is not recomputed here ──
 *
 * The backfilled signals came from the calibration corpus (M09), where each setup
 * was already walked forward against real candles and labelled WIN / LOSS /
 * EXPIRED, with its realised R and holding time. That labelling IS the outcome —
 * recomputing it would just re-derive the same number from the same candles, more
 * slowly, and risk disagreeing with the record the calibration was fitted on. So
 * the ledger settles each historical signal WITH its corpus outcome, and the track
 * record and the calibration then agree by construction — as they must, since a
 * "win" has to mean the same thing to both.
 *
 * The core numbers (win rate, R, expectancy, drawdown) are therefore REAL. The one
 * honest caveat: MFE and MAE were not separately recorded by the replay, so for
 * these historical entries they are reconstructed from the outcome (a winner ran at
 * least to its target; a loser at least to its stop) rather than measured
 * bar-by-bar. Live signals settled by the worker carry measured excursions.
 *
 * Runs once on boot when the ledger has open, unsettled historical signals — so the
 * track record is real the moment the platform starts.
 */
@Injectable()
export class LedgerBackfillService implements OnModuleInit {
  private readonly logger = new Logger(LedgerBackfillService.name);

  constructor(
    private readonly setups: CalibrationRepository,
    private readonly ledger: LedgerService,
    private readonly repository: LedgerRepository,
    private readonly signals: SignalRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    /*
     * Register any published signal not yet in the ledger.
     *
     * The tracker registers signals as they publish (on the event), but signals
     * published in a PRIOR boot fired their event then, not now — so on a fresh
     * start the ledger would miss them. This closes that gap: the ledger reconciles
     * against the signal store on boot, registering (idempotently) anything absent.
     * A live platform with a running publisher never needs this; a restarted one
     * does, and a ledger that forgot everything on reboot would be no ledger at all.
     */
    const published = await this.signals.recent({ since: 0, limit: 5000 });
    let registered = 0;
    for (const signal of published) {
      const existing = await this.repository.byId(signal.id);
      if (!existing) {
        await this.ledger.register(signal);
        registered += 1;
      }
    }
    if (registered > 0) this.logger.log(`Reconciled ${registered} published signal(s) into the ledger`);

    /* Then settle the historical ones from their known corpus outcomes. */
    await this.settleHistorical();
  }

  async settleHistorical(): Promise<{ settled: number }> {
    const open = await this.ledger.open();
    if (open.length === 0) return { settled: 0 };

    const setups = await this.setups.setups();

    /* Index the corpus by the identity a ledger entry can reconstruct. */
    const byKey = new Map<string, LabelledSetup>();
    for (const s of setups) {
      byKey.set(key(s.evidence.strategyId, s.evidence.symbol, s.evidence.timeframe, s.evidence.direction, s.barTime), s);
    }

    let settled = 0;
    const now = Date.now();

    for (const entry of open) {
      /* Leave genuinely recent signals for the live worker; only settle the past. */
      const barMs = timeframeMs(entry.timeframe);
      const isHistorical = now - entry.barTime > barMs * 100;
      if (!isHistorical) continue;

      const setup = byKey.get(key(entry.strategyId, entry.symbol, entry.timeframe, entry.direction, entry.barTime));
      if (!setup) continue;

      const result = await this.ledger.settleWith(entry.signalId, toSettlement(setup, entry, barMs));
      if (result) settled += 1;
    }

    if (settled > 0) this.logger.log(`Settled ${settled} historical signal(s) from the calibration corpus`);
    return { settled };
  }
}

function key(strategyId: string, symbol: string, timeframe: string, direction: string, barTime: number): string {
  return `${strategyId}:${symbol}:${timeframe}:${direction}:${barTime}`;
}

/** A corpus outcome → a ledger settlement. */
function toSettlement(
  setup: LabelledSetup,
  entry: { entryPrice: number; stopLoss: number; takeProfits: number[]; direction: "LONG" | "SHORT"; publishedAt: number },
  barMs: number,
): Settlement {
  const r = setup.realisedR;
  const won = setup.outcome === "WIN";
  const lost = setup.outcome === "LOSS";

  const outcome: OutcomeType = won ? "WINNER" : lost ? "LOSER" : "EXPIRED";
  const exitReason: ExitReason = won ? "TARGET_1" : lost ? "STOP_LOSS" : "EXPIRY";

  const long = entry.direction === "LONG";
  const exitPrice = won ? entry.takeProfits[0] : lost ? entry.stopLoss : entry.entryPrice;

  const triggeredAt = setup.barTime + barMs; // it entered one bar after it fired

  return {
    outcome,
    exitReason,
    realisedR: Math.round(r * 100) / 100,
    pnlPercent: Math.round(((long ? exitPrice - entry.entryPrice : entry.entryPrice - exitPrice) / entry.entryPrice) * 10000) / 100,
    exitPrice,
    /* Reconstructed from the outcome, not measured — see the class comment. A
     * winner reached at least its target's R; a loser reached at least its stop. */
    mfeR: Math.max(0, Math.round(r * 100) / 100),
    maeR: lost ? 1 : Math.max(0, Math.round(-Math.min(0, r) * 100) / 100),
    barsHeld: setup.barsHeld,
    triggeredAt,
    settledAt: setup.barTime + barMs * Math.max(1, setup.barsHeld),
  };
}
