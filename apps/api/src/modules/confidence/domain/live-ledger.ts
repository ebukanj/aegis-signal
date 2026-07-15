import { Injectable } from "@nestjs/common";

/**
 * Our own settled signals: what the platform ACTUALLY did, with real money, in
 * front of real users.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS THE ONLY THING IN THE PLATFORM THAT REALLY EARNS TRUST — AND IT
 *  IS EMPTY.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The historical replay is real evidence and it is honest evidence, but it is
 * evidence about a system that never had to be right in advance. The rules were
 * written by people who had already seen that history. No backtest, however
 * careful, escapes that — and this codebase's own ADR-024 records it as an
 * ACCEPTED risk rather than pretending otherwise.
 *
 * The live ledger has no such defect, and it cannot be re-run until it looks
 * good. Every row in it is a prediction made in public, before the outcome was
 * known.
 *
 * It does not exist yet, because no signal has ever been published. It arrives
 * with the Signal Engine (M10) and begins settling thereafter.
 *
 * ── Why an interface instead of nothing at all ──
 *
 * Because the alternative is that the entire blend — history as prior, live as
 * evidence, history dropped once live dominates — gets written later, in a hurry,
 * against a schema that already exists. The blend is the subtlest arithmetic in
 * this milestone and the easiest to get quietly wrong. It is written NOW, tested
 * NOW against synthetic ledgers, and wired to a source that truthfully reports
 * zero.
 *
 * When M10 lands, one class is replaced and nothing else moves.
 */
export interface LiveOutcomes {
  readonly wins: number;
  readonly samples: number;
}

export abstract class LiveLedger {
  /** Settled signals in this score bucket. */
  abstract forBucket(bucket: number): Promise<LiveOutcomes>;

  /** Settled signals for this exact strategy version. */
  abstract forStrategy(strategyId: string, rulesHash: string): Promise<LiveOutcomes>;

  /** Total settled signals, ever. */
  abstract total(): Promise<number>;
}

/**
 * The truthful implementation, for a platform that has published nothing.
 *
 * It returns zero. It does NOT return the historical rate, and the difference is
 * the entire point: a live ledger that quietly served backtested numbers would be
 * the single most consequential lie this platform could tell, because a backtest
 * can be re-run until it flatters and a live result cannot.
 *
 * Zero samples flows through `blend()` to an UNCALIBRATED or HISTORICAL basis —
 * never LIVE — and the contract refuses to carry a live win rate with no live
 * samples behind it. Three separate layers all say the same thing, and they all
 * have to be defeated at once to ship the lie.
 */
@Injectable()
export class EmptyLiveLedger extends LiveLedger {
  async forBucket(): Promise<LiveOutcomes> {
    return { wins: 0, samples: 0 };
  }

  async forStrategy(): Promise<LiveOutcomes> {
    return { wins: 0, samples: 0 };
  }

  async total(): Promise<number> {
    return 0;
  }
}
