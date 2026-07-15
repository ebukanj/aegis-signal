import type { Candle, ReplayOutcome, SignalDirection } from "@aegis/contracts";

/**
 * What did this setup actually DO?
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY NUMBER THIS PLATFORM EVER PRINTS ABOUT ITS OWN RELIABILITY
 *  DESCENDS FROM THIS FUNCTION.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The calibration model, the reliability curve, the win rate on a signal card,
 * the Track Record page — all of it is downstream of what happens here. A
 * generous labeller produces a platform that believes it is excellent, and there
 * is no test anywhere else in the codebase that would catch it, because every
 * other component would be faithfully processing numbers that were wrong before
 * they arrived.
 *
 * So this file is pessimistic by construction, in the three places where it is
 * possible to be either.
 */

export interface LabelledOutcome {
  readonly outcome: ReplayOutcome;
  readonly realisedR: number;
  readonly barsHeld: number;
}

/**
 * Walk a setup forward, bar by bar, until it resolves.
 *
 * @param future  candles STRICTLY AFTER the setup's bar. The setup's own bar is
 *                excluded — including it would let a trade be filled and resolved
 *                on evidence that had not closed when the decision was made,
 *                which is look-ahead bias in its purest form.
 */
export function label(
  future: readonly Candle[],
  direction: SignalDirection,
  entry: number,
  stop: number,
  target: number,
  maximumBars: number,
): LabelledOutcome {
  const long = direction === "LONG";
  const risk = Math.abs(entry - stop);

  if (risk <= 0) {
    throw new Error(
      "A setup with no risk cannot be labelled — it has no R to realise, and the position size that produced it was infinite",
    );
  }

  const horizon = Math.min(future.length, maximumBars);

  for (let i = 0; i < horizon; i += 1) {
    const bar = future[i];

    const hitTarget = long ? bar.high >= target : bar.low <= target;
    const hitStop = long ? bar.low <= stop : bar.high >= stop;

    /*
     * ══════════════════════════════════════════════════════════════════════
     *  THE BAR THAT TOUCHED BOTH — AND WHY IT MUST COUNT AS A LOSS
     * ══════════════════════════════════════════════════════════════════════
     *
     * An hourly candle with a high above the target and a low below the stop is
     * telling us that both prices traded during that hour. It is NOT telling us
     * in which order, and nothing in the candle can: OHLC records four numbers
     * and discards the path that produced them.
     *
     * So there is a choice, and it is the single most consequential line in this
     * milestone:
     *
     *   Call it a WIN   → the win rate rises, every backtest looks better, and
     *                     the platform is lying to itself in the specific
     *                     direction that costs its users money.
     *   Call it a LOSS  → the win rate falls and is DEFENSIBLE.
     *
     * This is the classic intrabar ambiguity, and it is one of the great silent
     * inflators of backtested results — precisely because it favours the
     * *aggressive* setups (a tight stop and a near target are the most likely to
     * be straddled by a single bar), which are also the ones a naive optimiser
     * will then select for.
     *
     * We take the loss. Not because it is likely — often the target really did
     * come first — but because we CANNOT KNOW, and a platform whose entire
     * premise is "measured, never asserted" does not get to resolve its own
     * ambiguities in its own favour.
     *
     * The honest resolution, when it matters, is to walk a finer timeframe. That
     * is a real improvement and it is written down in the docs as such. Until it
     * exists, the ambiguity costs us a win rather than gifting us one.
     */
    if (hitStop && hitTarget) {
      return { outcome: "LOSS", realisedR: -1, barsHeld: i + 1 };
    }

    if (hitStop) {
      return { outcome: "LOSS", realisedR: -1, barsHeld: i + 1 };
    }

    if (hitTarget) {
      const reward = Math.abs(target - entry);
      return { outcome: "WIN", realisedR: reward / risk, barsHeld: i + 1 };
    }
  }

  /*
   * ══════════════════════════════════════════════════════════════════════
   *  EXPIRED — AND WHY IT IS NOT SIMPLY DROPPED
   * ══════════════════════════════════════════════════════════════════════
   *
   * The market wandered sideways and the setup resolved neither way inside the
   * horizon. It is tempting to discard these — they are "inconclusive", after
   * all, and the win rate looks so much better without them.
   *
   * That temptation is the oldest way to manufacture a track record. Keep every
   * trade that worked, discard the ones that went nowhere, and report wins ÷
   * (wins + losses). The resulting number is arithmetically impeccable and
   * describes a strategy nobody traded.
   *
   * An EXPIRED setup is a real thing that really happened: capital was committed,
   * it sat there, and it earned nothing. It stays in the denominator. It is
   * counted as a NON-WIN, and marked to the closing bar so its R is honest rather
   * than assumed to be zero.
   */
  if (horizon === 0) {
    return { outcome: "EXPIRED", realisedR: 0, barsHeld: 0 };
  }

  const close = future[horizon - 1].close;
  const move = long ? close - entry : entry - close;

  return {
    outcome: "EXPIRED",
    realisedR: move / risk,
    barsHeld: horizon,
  };
}
