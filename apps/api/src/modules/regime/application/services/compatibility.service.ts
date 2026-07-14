import { Injectable } from "@nestjs/common";
import type { MarketRegime, StrategyDefinition } from "@aegis/contracts";

/**
 * Which strategies belong in this market?
 *
 * ── The engine does NOT decide this. The strategy does. ──
 *
 * The obvious implementation is a lookup table in here: `TRENDING_BULL → [breakout,
 * trend-pullback, …]`. It is faster to write and it quietly breaks the one rule
 * ADR-023 exists to protect — **a strategy is a document, and a user-created one
 * takes the identical code path as a built-in.**
 *
 * A strategy this engine has never heard of could never appear in a hardcoded map.
 * So every user-authored strategy would be either permanently invisible to the
 * regime filter, or silently treated as compatible with everything — and the second
 * is worse, because it looks like it is working.
 *
 * So each strategy DECLARES its regimes, and this service only reads them. It has no
 * opinions of its own and it cannot acquire any.
 *
 * **It exposes compatibility. It never executes anything** (out of scope, and it
 * will stay that way).
 */
@Injectable()
export class CompatibilityService {
  assess(
    strategies: readonly StrategyDefinition[],
    regime: MarketRegime,
  ): CompatibilityReport {
    const compatible: StrategyVerdict[] = [];
    const avoid: StrategyVerdict[] = [];

    for (const strategy of strategies) {
      const verdict = this.verdict(strategy, regime);

      if (verdict.compatible) compatible.push(verdict);
      else avoid.push(verdict);
    }

    return { regime, compatible, avoid };
  }

  verdict(strategy: StrategyDefinition, regime: MarketRegime): StrategyVerdict {
    /*
     * `avoidRegimes` is checked FIRST and it is absolute.
     *
     * These are two different claims and the order matters. "I work in a trend" is a
     * preference; "I am actively dangerous in a range" is a veto. A strategy that
     * listed a regime in BOTH lists would be contradicting itself, and the veto is
     * the one to honour — the downside of skipping a good trade is a missed trade,
     * and the downside of taking a forbidden one is a mean-reversion strategy selling
     * every new high, all the way up.
     */
    if (strategy.avoidRegimes.includes(regime)) {
      return {
        id: strategy.id,
        name: strategy.name,
        compatible: false,
        reason: `${strategy.name} declares ${regime} as a market to AVOID — it is not merely unprofitable here, it is the wrong tool`,
      };
    }

    /*
     * An empty `regimes` list means no restriction, and it is an honest default
     * rather than an oversight. A strategy that genuinely does not care about the
     * environment is entitled to say so — and a NEW strategy, which the platform
     * knows nothing about yet, must not have an opinion invented on its behalf.
     */
    if (strategy.regimes.length === 0) {
      return {
        id: strategy.id,
        name: strategy.name,
        compatible: true,
        reason: `${strategy.name} declares no regime restriction — it runs anywhere`,
      };
    }

    if (strategy.regimes.includes(regime)) {
      return {
        id: strategy.id,
        name: strategy.name,
        compatible: true,
        reason: `${strategy.name} is built for ${regime}`,
      };
    }

    return {
      id: strategy.id,
      name: strategy.name,
      compatible: false,
      reason: `${strategy.name} is built for ${strategy.regimes.join(" or ")}, and this market is ${regime}`,
    };
  }
}

export interface StrategyVerdict {
  id: string;
  name: string;
  compatible: boolean;
  /** Plain English. The trader is entitled to know why a strategy went quiet. */
  reason: string;
}

export interface CompatibilityReport {
  regime: MarketRegime;
  compatible: StrategyVerdict[];
  avoid: StrategyVerdict[];
}
