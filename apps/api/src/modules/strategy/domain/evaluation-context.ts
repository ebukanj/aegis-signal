import type {
  Candle,
  DetectedPattern,
  MarketContext,
  MarketRegime,
  Timeframe,
} from "@aegis/contracts";
import type { Maybe } from "../../indicators/application/math/rolling";

/**
 * Everything an evaluation is allowed to see, and nothing else.
 *
 * **Immutable, and assembled once.** The evaluator receives this and interprets a
 * document against it — it never reaches back to an engine mid-evaluation, never
 * fetches, never computes.
 *
 * ── Why that boundary is not merely tidy ──
 *
 * If a rule could trigger a calculation, then the ORDER the rules were written in
 * would change what they cost, and — far worse — a rule evaluated late could see a
 * market that had moved since the rule before it. Two conditions in the same strategy
 * would be judging two different moments.
 *
 * Everything is resolved up front, from one bar, and the whole document is judged
 * against a single frozen instant. That is what makes an evaluation *reproducible*,
 * which is what makes calibration possible (ADR-024).
 */
export interface EvaluationContext {
  readonly symbol: string;
  readonly exchange: string;

  /** The strategy's own timeframe. The bar its rules fire on. */
  readonly timeframe: Timeframe;

  /**
   * Closed candles, per timeframe.
   *
   * More than one because a 1h strategy may ask "…but is the 4h trend up?" — which
   * is not a nicety. A signal that ignores the higher timeframe is a signal that
   * buys bounces in downtrends.
   */
  readonly candles: Readonly<Record<string, readonly Candle[]>>;

  /**
   * Every indicator series the document asked for, by canonical key.
   *
   * `"rsi:period=14:1h"`. The key comes from `indicatorKey()` in the contracts, so
   * the resolver that writes it and the evaluator that reads it cannot drift apart
   * on the naming rule.
   */
  readonly indicators: Readonly<Record<string, readonly Maybe[]>>;

  /** Patterns found, per timeframe. */
  readonly patterns: Readonly<Record<string, readonly DetectedPattern[]>>;

  /** The regime, per timeframe, plus alignment and conflict. */
  readonly market: MarketContext;

  /** The regime on the strategy's own timeframe. The one the gate reads. */
  readonly regime: MarketRegime;

  /** The bar the rules are judged on. Always CLOSED. */
  readonly bar: Candle;
}

/**
 * A dependency the document needs.
 *
 * Collected by walking the document BEFORE anything is computed, so every engine is
 * asked once, in parallel, for everything at once.
 */
export interface Dependencies {
  /** Indicator instances, deduplicated. Keyed by `indicatorKey()`. */
  indicators: {
    key: string;
    indicator: string;
    timeframe: Timeframe;
    params: Record<string, unknown>;
  }[];

  /** Every timeframe the document touches — its own, plus any a rule names. */
  timeframes: Timeframe[];

  /** True when any rule is a pattern condition, so patterns must be detected. */
  needsPatterns: boolean;
}
