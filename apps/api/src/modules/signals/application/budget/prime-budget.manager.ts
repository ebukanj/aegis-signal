import { Injectable } from "@nestjs/common";
import type { SignalPolicy } from "../../signal.policy";

/** One candidate for a Prime slot, already ranked and confidence-scored. */
export interface PrimeContender {
  readonly signalId: string;
  readonly symbol: string;
  readonly strategies: readonly string[];
  readonly timeframe: string;
  readonly score: number;
  readonly confidenceScore: number;
  /** The Confidence Engine's authoritative verdict — proven AND above the Prime floor. */
  readonly primeEligible: boolean;
}

/** What today's budget has already committed to, so caps can be enforced. */
export interface BudgetLedger {
  readonly total: number;
  readonly awarded: number;
  readonly perSymbol: ReadonlyMap<string, number>;
  readonly perStrategy: ReadonlyMap<string, number>;
  readonly thisHour: number;
}

export interface PrimeDecision {
  readonly primed: boolean;
  readonly slot: number | null;
  readonly reason: string;
}

/**
 * The scarcity engine. Prime is the day's few elite slots (ADR-021 §2), and this
 * decides who gets one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  PRIME AWARDS ZERO TODAY, AND THAT IS CORRECT — NOT A BUG
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Prime requires `primeEligible`, and the Confidence Engine sets that only when a
 * strategy is PROVEN — when it has a settled LIVE record, not merely a replayed
 * one (ADR-023 §4). No signal has ever been published and settled, so no strategy
 * is proven, so nothing is Prime.
 *
 * This is the platform's honesty made structural. Prime is where the platform
 * stakes its reputation and interrupts a trader; a backtest does not earn that. The
 * sequencing is deliberate and correct: publish non-Prime signals now → they settle
 * in the ledger (M11) → strategies earn a live record → Prime unlocks for future
 * signals. A Prime budget that awarded slots to unproven strategies on day one
 * would be the whole fraud this codebase exists to refuse, wearing a gold star.
 *
 * The MECHANISM is fully built and tested — the caps, the floor, the ranked
 * allocation — so that the day a strategy becomes proven, Prime works without a
 * line changing. It simply, honestly, has nothing to award yet.
 */
@Injectable()
export class PrimeBudgetManager {
  /**
   * Decide whether a contender takes a Prime slot, given what the day has already
   * spent. Contenders MUST be offered in rank order (strongest first) — the caller
   * owns ranking, this owns scarcity.
   */
  consider(
    contender: PrimeContender,
    ledger: BudgetLedger,
    policy: SignalPolicy,
  ): PrimeDecision {
    const b = policy.primeBudget;

    /*
     * The gate that matters most, checked first and stated plainly. Everything
     * downstream is about scarcity; this is about whether the signal has EARNED the
     * right to be considered at all.
     */
    if (!contender.primeEligible) {
      return {
        primed: false,
        slot: null,
        reason:
          "not Prime-eligible — the strategy has no settled live record yet, and Prime is reserved for what a strategy has PROVEN, not what a backtest suggests (ADR-023 §4)",
      };
    }

    if (contender.confidenceScore < policy.primeConfidenceFloor) {
      return {
        primed: false,
        slot: null,
        reason: `confidence ${contender.confidenceScore} is below the Prime floor of ${policy.primeConfidenceFloor}`,
      };
    }

    if (ledger.awarded >= b.perDay) {
      return {
        primed: false,
        slot: null,
        reason: `the day's Prime budget of ${b.perDay} is spent — a stronger signal already took the last slot, and Prime does not stack (ADR-021 §2)`,
      };
    }

    if (ledger.thisHour >= b.perHour) {
      return {
        primed: false,
        slot: null,
        reason: `${b.perHour} Prime signals already fired this hour — a single volatile hour does not get to spend the whole day's attention`,
      };
    }

    if ((ledger.perSymbol.get(contender.symbol) ?? 0) >= b.perSymbol) {
      return {
        primed: false,
        slot: null,
        reason: `${contender.symbol} already holds ${b.perSymbol} Prime slot(s) today — one coin cannot own the feed`,
      };
    }

    for (const strategy of contender.strategies) {
      if ((ledger.perStrategy.get(strategy) ?? 0) >= b.perStrategy) {
        return {
          primed: false,
          slot: null,
          reason: `strategy ${strategy} already holds ${b.perStrategy} Prime slot(s) today — the day should not be one thesis repeated`,
        };
      }
    }

    return {
      primed: true,
      slot: ledger.awarded + 1,
      reason: `awarded Prime slot ${ledger.awarded + 1} of ${b.perDay} — confidence ${contender.confidenceScore}, score ${contender.score.toFixed(1)}`,
    };
  }
}
