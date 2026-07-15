import { Injectable } from "@nestjs/common";
import type { LedgerEntry, OutcomeType, TrackRecord } from "@aegis/contracts";
import { LedgerRepository } from "../../infrastructure/repository/ledger.repository";
import { StatisticsEngine } from "../statistics/statistics.engine";

/**
 * Historical replay — recreate history, exactly.
 *
 * ── Why "replay" is trivial here, and that is the whole point ──
 *
 * In most systems, replaying history means re-running a simulation and hoping it
 * lands where it did before. Here it cannot drift, because history is not
 * simulated — it is STORED. The ledger holds what happened; replay is a pure,
 * deterministic re-read of it through the same statistics engine the live track
 * record uses. The same ledger always produces the same numbers, for any slice:
 * one signal, one strategy, one symbol, one regime, a date range.
 *
 * That the replay is boring is the feature. A replay that could surprise you is a
 * replay you could not trust, and the ledger exists precisely so that the past has
 * exactly one account.
 */
@Injectable()
export class ReplayEngine {
  constructor(
    private readonly repository: LedgerRepository,
    private readonly statistics: StatisticsEngine,
  ) {}

  /** Re-derive a scoped track record from the immutable ledger. Deterministic. */
  async replay(filter: {
    strategyId?: string;
    rulesHash?: string;
    symbol?: string;
    regime?: string;
    outcome?: OutcomeType;
    from?: number;
    to?: number;
  }): Promise<TrackRecord> {
    const settled = await this.repository.settled(filter);
    return this.statistics.trackRecord(settled, {
      total: settled.length,
      settled: settled.length,
      open: 0,
    });
  }

  /** One signal's complete, ordered history — registration through settlement. */
  async replaySignal(signalId: string): Promise<{ entry: LedgerEntry | null; audit: unknown[] }> {
    const [entry, audit] = await Promise.all([
      this.repository.byId(signalId),
      this.repository.history(signalId),
    ]);
    return { entry, audit };
  }
}
