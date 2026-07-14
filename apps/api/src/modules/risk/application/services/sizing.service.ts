import { Injectable } from "@nestjs/common";
import type {
  CandidateSignal,
  LeverageRecommendation,
  PositionSizing,
  StrategyDefinition,
} from "@aegis/contracts";
import type { RiskPolicy } from "../../risk.policy";

/**
 * How much to put on, and how much leverage may be used to do it.
 *
 * This is the one thing the Risk Engine *produces* rather than merely judges — and it is
 * produced last, after every gate has passed, because sizing a trade the engine is about
 * to veto would be arithmetic in service of nothing.
 */
@Injectable()
export class SizingService {
  /**
   * ── RISK IS DEFINED BY THE STOP, NEVER BY THE LEVERAGE ──
   *
   *     quantity = (equity × risk%) / |entry − stop|
   *
   * Leverage appears nowhere in that formula, and its absence is the entire discipline.
   * Leverage decides only how much margin you post; it has no bearing on how much you
   * lose when the stop is hit, because *the stop decides that*.
   *
   * A trader who sizes by leverage — "I'll go 10x" — has no idea what they stand to lose.
   * They have chosen a margin requirement and left the loss to be determined by wherever
   * the stop happens to sit. That is not a style difference. **It is the mechanism by
   * which accounts die**, and this formula is the platform's refusal to participate in it.
   */
  size(input: {
    candidate: CandidateSignal;
    strategy: StrategyDefinition;
    policy: RiskPolicy;
    leverage: number | null;
  }): PositionSizing {
    const { candidate, strategy, policy, leverage } = input;

    const equity = policy.accountEquity;
    const riskPercent = strategy.riskPercent;
    const riskAmount = equity * (riskPercent / 100);

    const stopDistance = Math.abs(candidate.entryPrice - candidate.proposedStop);
    const stopDistancePercent = (stopDistance / candidate.entryPrice) * 100;

    const quantity = riskAmount / stopDistance;
    const notional = quantity * candidate.entryPrice;

    return {
      equity,
      riskPercent,
      riskAmount,

      entryPrice: candidate.entryPrice,
      stopLoss: candidate.proposedStop,
      stopDistancePercent,

      quantity,
      notional,

      leverage,
      marginRequired: leverage === null ? null : notional / leverage,
    };
  }

  /**
   * How much leverage — and the one rule that must never be broken.
   *
   * ── If liquidation comes before the stop, the stop is decoration ──
   *
   * This is the most expensive mistake in leveraged trading, and most platforms will
   * cheerfully let a user make it. At high enough leverage the exchange closes the
   * position *before* the price ever reaches the stop — so the trade is never proven
   * wrong, the risk management never runs, and the account is simply gone. The trader
   * did everything right, set a sensible stop, and lost anyway.
   *
   * The contract refuses to even REPRESENT such a recommendation
   * (`liquidationBeforeStop` must be false, `liquidationBufferR` must clear the policy).
   * This method's job is to make sure it never has to.
   *
   * ── Why it searches downward instead of solving ──
   *
   * The exchange's own margin rules — maintenance margin tiers, funding, fees — are the
   * authority, and they are neither simple nor stable. Rather than pretend to a precise
   * inverse, this walks leverage DOWN from the cap and takes the first level that clears
   * the buffer with room to spare. Conservative by construction: when the estimate is
   * wrong, it is wrong in the direction of less leverage.
   *
   * @returns null when NO leverage is safe — which is itself a veto, upstream.
   */
  leverage(input: {
    candidate: CandidateSignal;
    strategy: StrategyDefinition;
    policy: RiskPolicy;
  }): LeverageRecommendation | null {
    const { candidate, strategy, policy } = input;

    if (candidate.market === "SPOT") return null;

    const cap = Math.min(
      strategy.maxLeverage ?? policy.maximumLeverage,
      policy.maximumLeverage,
    );

    const entry = candidate.entryPrice;
    const stop = candidate.proposedStop;
    const risk = Math.abs(entry - stop);
    const long = candidate.direction === "LONG";

    for (let leverage = cap; leverage >= 1; leverage--) {
      /*
       * Liquidation, estimated.
       *
       * At L× leverage the position is liquidated at roughly 1/L adverse move, less the
       * maintenance margin the exchange holds back. MAINTENANCE_MARGIN is deliberately
       * generous — it makes the estimated liquidation CLOSER than it really is, so every
       * error lands on the side of caution.
       */
      const adverseMove = (1 / leverage) - MAINTENANCE_MARGIN;

      if (adverseMove <= 0) continue;

      const liquidationPrice = long
        ? entry * (1 - adverseMove)
        : entry * (1 + adverseMove);

      const liquidationBeforeStop = long
        ? liquidationPrice >= stop
        : liquidationPrice <= stop;

      if (liquidationBeforeStop) continue;

      /** How far liquidation sits BEYOND the stop, in units of the trade's own risk. */
      const bufferR = Math.abs(liquidationPrice - stop) / risk;

      if (bufferR < policy.minimumLiquidationBufferR) continue;

      return {
        suggested: leverage,
        maxAllowed: cap,
        liquidationPrice,
        liquidationBeforeStop: false,
        liquidationBufferR: bufferR,
        reason:
          `${leverage}× is the highest leverage at which liquidation (${liquidationPrice.toFixed(2)}) still sits ` +
          `${bufferR.toFixed(1)}R beyond the stop (${stop.toFixed(2)}). ` +
          `The stop decides this trade, not the exchange.`,
      };
    }

    /*
     * Not even 1× clears the buffer.
     *
     * That means the stop is so far away that a 100% adverse move would be needed to
     * reach liquidation with room to spare — which in practice means the stop is enormous.
     * There is no safe leverage, and the caller vetoes.
     */
    return null;
  }
}

/**
 * The exchange's maintenance margin, over-estimated on purpose.
 *
 * Real maintenance margin on a major perpetual is around 0.5%. Using 1% moves the
 * estimated liquidation price CLOSER to the entry than it truly is — so every mistake
 * this makes is a mistake in the direction of recommending LESS leverage.
 *
 * The exchange's own rules are authoritative. This is a conservative approximation of
 * them, and it is conservative deliberately: the failure mode of over-estimating
 * liquidation distance is a liquidated account.
 */
const MAINTENANCE_MARGIN = 0.01;
