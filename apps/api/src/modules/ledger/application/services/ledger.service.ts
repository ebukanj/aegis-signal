import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  ledgerEntrySchema,
  type AuditEvent,
  type Candle,
  type LedgerEntry,
  type PublishedSignal,
  type Settlement,
  type TrackRecord,
} from "@aegis/contracts";

import { LedgerRepository } from "../../infrastructure/repository/ledger.repository";
import { StatisticsEngine } from "../statistics/statistics.engine";
import { calculateOutcome } from "../settlement/outcome.calculator";

/**
 * The Outcome Ledger's front door.
 *
 * The previous engines ask about the present; this answers the one question that
 * can never be revised — *what actually happened?* — and it answers it once,
 * immutably. It is the source of truth the Confidence Engine calibrates against
 * and the Track Record is built from. Nothing in the platform relies on memory;
 * everything relies on this.
 */
@Injectable()
export class LedgerService {

  constructor(
    private readonly repository: LedgerRepository,
    private readonly statistics: StatisticsEngine,
    private readonly events: EventEmitter2,
  ) {}

  /* ── Registration ──────────────────────────────────────────────── */

  /** Record a published signal, immutably. Idempotent on the signal id. */
  async register(signal: PublishedSignal): Promise<void> {
    const entry = toLedgerEntry(signal);
    const { created } = await this.repository.register(entry);
    if (created) {
      this.events.emit("ledger.tracked", { signalId: entry.signalId, strategyId: entry.strategyId });
    }
  }

  /* ── Settlement ────────────────────────────────────────────────── */

  /**
   * Settle an open entry from its price path. The outcome is COMPUTED from candles,
   * never supplied — a settlement a caller could dictate is not a record of what
   * happened, it is a record of what the caller wanted.
   */
  async settleFromCandles(
    signalId: string,
    future: readonly Candle[],
    horizon: { maxBarsToTrigger: number; maxBarsToResolve: number; barMs: number },
  ): Promise<Settlement | null> {
    const entry = await this.repository.byId(signalId);
    if (!entry || entry.settlement) return null;

    const settlement = calculateOutcome({
      direction: entry.direction,
      entryPrice: entry.entryPrice,
      stopLoss: entry.stopLoss,
      takeProfits: entry.takeProfits,
      publishedAt: entry.publishedAt,
      future,
      ...horizon,
    });

    return this.commitSettlement(entry, settlement);
  }

  /**
   * Settle with an outcome known from another source (the historical corpus, whose
   * outcome was labelled by the confidence replay). Still immutable, still audited —
   * the ledger does not care WHERE the truth came from, only that it is recorded once.
   */
  async settleWith(signalId: string, settlement: Settlement): Promise<Settlement | null> {
    const entry = await this.repository.byId(signalId);
    if (!entry || entry.settlement) return null;
    return this.commitSettlement(entry, settlement);
  }

  private async commitSettlement(entry: LedgerEntry, settlement: Settlement): Promise<Settlement | null> {
    const { settled } = await this.repository.settle(entry.signalId, settlement);
    if (!settled) return null;

    this.events.emit("ledger.settled", {
      signalId: entry.signalId,
      strategyId: entry.strategyId,
      outcome: settlement.outcome,
      realisedR: settlement.realisedR,
    });

    /*
     * The calibration hand-off. A settled signal is a new OUTCOME the Confidence
     * Engine can learn from — the live ledger that ADR-024 says will eventually
     * outweigh the historical replay. The event is emitted; consuming it (updating
     * the live win rate) is the Confidence Engine's job, and wiring that fully is a
     * later refinement, but the truth is available the moment it exists.
     */
    this.events.emit("ledger.calibration-data-available", {
      signalId: entry.signalId,
      strategyId: entry.strategyId,
      score: entry.confidence.score,
      won: settlement.realisedR > 0,
    });

    return settlement;
  }

  /* ── The record ────────────────────────────────────────────────── */

  async trackRecord(): Promise<TrackRecord> {
    const counts = await this.repository.counts();
    const settled = await this.repository.settled({ limit: 10_000 });
    return this.statistics.trackRecord(settled, counts);
  }

  async entry(signalId: string): Promise<LedgerEntry | null> {
    return this.repository.byId(signalId);
  }

  async history(signalId: string): Promise<AuditEvent[]> {
    return this.repository.history(signalId);
  }

  async open(): Promise<LedgerEntry[]> {
    return this.repository.open();
  }

  async metrics(): Promise<Record<string, unknown>> {
    const counts = await this.repository.counts();
    const record = await this.trackRecord();
    return {
      totalSignals: counts.total,
      settledSignals: counts.settled,
      openSignals: counts.open,
      winRate: record.winRate,
      averageReturnR: record.averageReturnR,
      totalR: record.totalR,
      largestDrawdownR: record.byStrategy.reduce((worst, s) => Math.max(worst, s.maxDrawdownR ?? 0), 0),
      mostActiveStrategy:
        record.byStrategy.slice().sort((a, b) => b.sampleSize - a.sampleSize)[0]?.strategyId ?? null,
      basis: record.basis,
    };
  }
}

/* ── Mapping ───────────────────────────────────────────────────────── */

/**
 * A published signal → its permanent ledger entry. Everything is copied whole and
 * frozen; nothing is recomputed. The primary strategy (index 0) and its rules hash
 * become the entry's identity for per-strategy statistics.
 */
export function toLedgerEntry(signal: PublishedSignal): LedgerEntry {
  return ledgerEntrySchema.parse({
    signalId: signal.id,
    strategyId: signal.strategies[0],
    strategyVersion: 1,
    rulesHash: signal.rulesHashes[0],
    symbol: signal.symbol,
    exchange: signal.exchange,
    market: signal.marketType,
    timeframe: signal.timeframe,
    direction: signal.direction,
    regime: signal.regime,
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfits: signal.takeProfits,
    confidence: signal.confidence,
    confluence: signal.confluence,
    signalScore: signal.signalScore,
    calibrationVersion: signal.calibrationVersion,
    publishedAt: signal.publishedAt,
    barTime: signal.barTime,
    settlement: null,
  });
}
