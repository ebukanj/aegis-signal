import { Injectable } from "@nestjs/common";
import { indicatorKey, type SignalDirection, type StrategyDefinition } from "@aegis/contracts";
import type { EvaluationContext } from "../../domain/evaluation-context";

/**
 * Where the document SAYS the stop goes, and where its targets sit.
 *
 * ── A PROPOSAL. Nothing here is a decision. ──
 *
 * The Risk Engine owns the stop, the position size, the leverage and the market type
 * (AGENTS.md §2). It can move this stop, and it can refuse the trade outright because
 * of where it lands — too tight to survive the noise, too wide to be worth taking, on
 * the far side of a level that would have been hit first.
 *
 * The evaluator computes it only because the rule is written in the document it is
 * interpreting. It does not get to insist on it, and the fields are called
 * `proposedStop` and `proposedTargets` precisely so that nothing downstream can read
 * them as settled. A field called `stopLoss` here would eventually be acted on by
 * something that forgot to ask the engine that is supposed to own it.
 */
@Injectable()
export class TradePlanner {
  plan(
    strategy: StrategyDefinition,
    context: EvaluationContext,
    direction: SignalDirection,
  ): { stop: number; targets: number[] } | null {
    const entry = context.bar.close;

    const stop = this.stop(strategy, context, direction, entry);
    if (stop === null) return null;

    const risk = Math.abs(entry - stop);

    /*
     * A ZERO-RISK TRADE IS NOT A GIFT. IT IS A BUG.
     *
     * If the stop lands on the entry, `(equity × risk%) / |entry − stop|` divides by
     * zero and hands back an infinite position size. It would look like the best trade
     * the platform had ever seen right up to the liquidation.
     *
     * The Risk Engine would catch it. It should never have to.
     */
    if (risk <= 0 || !Number.isFinite(risk)) return null;

    /*
     * The stop must be on the LOSING side of the entry. A LONG stops below.
     *
     * A structure stop can genuinely produce a stop above entry — if price has already
     * run far from the swing low it is anchored to. That is not a bad trade; it is an
     * impossible one, and the contract refuses it. Better to reject here than to emit
     * a candidate that dies at schema validation with a confusing message.
     */
    const onLosingSide = direction === "LONG" ? stop < entry : stop > entry;
    if (!onLosingSide) return null;

    /*
     * Targets are stated in R — multiples of the distance to the stop — so a target is
     * always relative to the risk taken to reach it. "2R" means the same thing on BTC
     * and on a memecoin, and a strategy's targets do not have to be retuned per
     * instrument.
     */
    const targets = strategy.targets.map((target) =>
      direction === "LONG"
        ? entry + risk * target.rMultiple
        : entry - risk * target.rMultiple,
    );

    // A SHORT whose target went below zero is arithmetic that escaped its market.
    if (targets.some((t) => !Number.isFinite(t) || t <= 0)) return null;

    return { stop, targets };
  }

  /* ── The three stop rules ────────────────────────────────────────── */

  private stop(
    strategy: StrategyDefinition,
    context: EvaluationContext,
    direction: SignalDirection,
    entry: number,
  ): number | null {
    const rule = strategy.stop;

    switch (rule.kind) {
      /*
       * ATR — the stop that adapts to the market's own volatility.
       *
       * The only one of the three that is right by default. A fixed percentage stop is
       * too tight in a volatile market and absurdly wide in a quiet one; an ATR stop is
       * the same *statement* in both: "beyond the noise this instrument is currently
       * producing".
       */
      case "atr": {
        const key = indicatorKey({
          indicator: "atr",
          timeframe: context.timeframe,
          params: { period: rule.period },
        });

        const atr = last(context.indicators[key]);
        if (atr === null || atr <= 0) return null;

        const distance = atr * rule.multiplier;

        return direction === "LONG" ? entry - distance : entry + distance;
      }

      case "percent": {
        const distance = entry * (rule.value / 100);
        return direction === "LONG" ? entry - distance : entry + distance;
      }

      /*
       * STRUCTURE — below the lowest low, or above the highest high.
       *
       * The stop a trader would actually draw. It says "I am wrong if the market takes
       * out the level that defined this move", which is a *reason*, where an ATR stop
       * is only a distance.
       *
       * A small buffer is added beyond the level, and it is not decoration: a stop
       * placed exactly ON an obvious swing low is a stop resting in the pool of
       * liquidity that every other trader's stop is also resting in — which is
       * precisely where the market reaches before it reverses (M05, LIQUIDITY_SWEEP).
       */
      case "structure": {
        const key = indicatorKey({
          indicator: direction === "LONG" ? "lowest_low" : "highest_high",
          timeframe: context.timeframe,
          params: { period: rule.lookback },
        });

        const level = last(context.indicators[key]);
        if (level === null || level <= 0) return null;

        return direction === "LONG"
          ? level * (1 - STRUCTURE_BUFFER)
          : level * (1 + STRUCTURE_BUFFER);
      }
    }
  }
}

function last(series: readonly (number | null)[] | undefined): number | null {
  if (!series) return null;

  for (let i = series.length - 1; i >= 0; i--) {
    const value = series[i];
    if (value !== null && value !== undefined) return value;
  }

  return null;
}

/**
 * How far beyond the structural level the stop sits.
 *
 * 0.15%. Enough to be outside the stop pool that clusters exactly on the level;
 * small enough that it does not materially change the risk the trade was sized for.
 */
const STRUCTURE_BUFFER = 0.0015;
