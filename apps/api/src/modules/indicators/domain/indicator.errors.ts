/**
 * The ways an indicator can refuse.
 *
 * **Every one of these is a refusal, never a fallback.** There is no error here
 * that results in a number being returned anyway, because a number returned
 * despite an error is indistinguishable from a correct one by the time it reaches
 * a strategy — and the strategy will trade on it.
 */

export class IndicatorError extends Error {
  constructor(
    readonly indicator: string,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(`${indicator}: ${message}`);
    this.name = new.target.name;
  }
}

/**
 * Not enough history.
 *
 * An EMA(200) needs 200 bars. Given 50, the wrong answer is to compute an EMA(50)
 * and call it an EMA(200) — which is what most libraries quietly do. The right
 * answer is to refuse, because a strategy asking "is price above the 200 EMA" on
 * a coin listed a week ago is asking a question with no answer.
 */
export class InsufficientCandlesError extends IndicatorError {
  constructor(indicator: string, required: number, available: number) {
    super(
      indicator,
      `needs ${required} candles and was given ${available} — refusing to compute a shorter indicator and call it a longer one`,
      { required, available },
    );
  }
}

/** The candle series itself is unusable — gaps, disorder, NaN, negative volume. */
export class MalformedSeriesError extends IndicatorError {
  constructor(indicator: string, reason: string, detail?: Record<string, unknown>) {
    super(indicator, `the candle series is unusable — ${reason}`, detail);
  }
}

/** Asked for something that is not in the vocabulary. */
export class UnknownIndicatorError extends IndicatorError {
  constructor(indicator: string) {
    super(indicator, "is not an indicator this platform knows");
  }
}

/**
 * The indicator exists, but the feed behind it does not.
 *
 * Funding rate, open interest, long/short ratio. Distinct from "unknown" on
 * purpose: this is a fact about the world, not a bug in the request, and a
 * strategy that hits it should stand down rather than be told it is broken.
 */
export class FeedUnavailableError extends IndicatorError {
  constructor(indicator: string) {
    super(
      indicator,
      "requires a market feed this platform does not yet have — the strategy must stand down rather than guess",
    );
  }
}

/** Parameters that cannot produce a meaningful result. */
export class InvalidParametersError extends IndicatorError {
  constructor(indicator: string, reason: string) {
    super(indicator, `invalid parameters — ${reason}`);
  }
}
