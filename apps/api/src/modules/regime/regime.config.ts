/**
 * The weights. Configurable, as the brief requires — and dangerous, as it does not
 * say.
 *
 * These decide what "the market is bullish" MEANS. Change them and the platform's
 * entire notion of a bull market changes with them, silently, for every strategy
 * and every signal downstream. They are not a tuning knob to be swept; they are a
 * statement about how markets work.
 *
 * ── Why trend carries the most, and why volume carries as much as momentum ──
 *
 * Trend (30%) is the largest single voter because the question this engine answers
 * is mostly a question about trend. But it is deliberately NOT a majority: an engine
 * where trend alone could carry the vote is an engine that cannot be told it is
 * wrong, and a trend feature is exactly the thing that is still shouting "bull" at
 * the top.
 *
 * Structure (25%) is second because it is the only voter that can see a change of
 * character — the first structural crack, which arrives while every other feature
 * is still bullish (ADR-024 calls market structure "the highest-value item").
 *
 * Volume (20%) is equal to momentum, and that is the unusual choice. Trend, momentum
 * and structure all read PRICE; volume is the only voter reading PARTICIPATION. When
 * it dissents from the other four — a rally on collapsing volume — it is usually
 * right, and a weight that let it be drowned out would waste the one independent
 * source of evidence in the room.
 *
 * Volatility (5%) is small on the DIRECTION axis on purpose: volatility is mostly
 * not a directional statement, and it has an entire axis of its own where it carries
 * all the weight.
 */
export interface RegimeWeights {
  readonly [feature: string]: number;
}

export const REGIME_WEIGHTS: RegimeWeights = {
  trend: 0.3,
  structure: 0.25,
  momentum: 0.2,
  volume: 0.2,
  volatility: 0.05,
};

/**
 * The weights must sum to 1, and this is checked at boot.
 *
 * Weights that sum to 0.9 do not fail — they quietly compress every agreement score
 * by 10%, and a threshold tuned against them means something slightly different from
 * what it says. It is the kind of bug that never announces itself and shifts every
 * number in the platform by a hair.
 */
export function assertWeightsValid(weights: RegimeWeights): void {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);

  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(
      `The regime weights sum to ${total.toFixed(4)}, not 1. They would silently ` +
        `rescale every agreement score in the platform.`,
    );
  }

  for (const [name, weight] of Object.entries(weights)) {
    if (weight < 0) {
      throw new Error(
        `The regime weight for "${name}" is negative. A negative weight inverts the ` +
          `feature's meaning — if that is genuinely intended, invert the feature, not its weight.`,
      );
    }
  }
}

/**
 * How much a higher timeframe's dissent counts against a lower one.
 *
 * The daily overrules the 15m; the 15m never overrules the daily. This is not a
 * preference — it is how markets work, and an engine that weighted them equally
 * would let a 15m bounce cancel out a daily bear market.
 */
export const TIMEFRAME_AUTHORITY: Record<string, number> = {
  "15m": 1,
  "1h": 2,
  "4h": 4,
  "1d": 8,
};
