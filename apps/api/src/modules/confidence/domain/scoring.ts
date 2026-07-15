import type {
  CandidateSignal,
  Candle,
  ConfidenceContributor,
  DetectedPattern,
  MarketContext,
  RiskAssessment,
  StrategyDefinition,
  Zone,
} from "@aegis/contracts";
import type { Maybe } from "../../indicators/application/math/rolling";
import type { ConfidencePolicy } from "../confidence.policy";

/**
 * Everything a contributor may look at — and, far more importantly, everything
 * it may NOT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE INVARIANT THIS TYPE EXISTS TO ENFORCE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A calibration model maps SCORE → WIN RATE. It is fitted on scores produced
 * during a replay of exchange history, and then applied to scores produced live.
 *
 * **If those two scores are not computed by the same function, from the same
 * kinds of input, the model is meaningless.** Not slightly off — meaningless. It
 * would be a lookup table built for one quantity and applied to another that
 * merely shares its name and range.
 *
 * The single easiest way to break that is to let a live contributor read
 * something the replay cannot see. And there is a large, tempting class of
 * exactly such things:
 *
 *   **Binance does not sell you the order book of March 2024.**
 *
 * Spread, book depth, exchange latency, funding — none of it is recoverable from
 * historical candles. A "liquidity: +7" contributor would therefore be worth +7
 * live and structurally absent in the corpus, shifting the live score
 * distribution away from the one the calibrator was fitted on, and every
 * published probability would be quietly wrong.
 *
 * So this context does not merely *discourage* reading them. **It does not
 * contain them.** There is no `book`, no `ticker`, no `exchangeHealth` field to
 * reach for. The invariant is enforced by the type system rather than by a
 * comment asking nicely, because comments do not survive a deadline.
 *
 * ── "But liquidity obviously matters" ──
 *
 * It does, enormously — and it is already handled, in the right place. The Risk
 * Engine VETOES on a thin book and a wide spread (M08). Microstructure is a
 * question of whether the trade can be *taken*; it is not evidence about whether
 * this KIND of setup wins. The two engines are asking different questions, and
 * this is where the boundary between them falls.
 *
 * What the score does use as a liquidity signal is quote volume — price × volume
 * — which IS in every candle, historically and live, and is therefore honest in
 * both worlds.
 */
export interface ScoringContext {
  readonly candidate: CandidateSignal;
  readonly strategy: StrategyDefinition;
  readonly policy: ConfidencePolicy;

  readonly candles: readonly Candle[];
  readonly patterns: readonly DetectedPattern[];
  readonly zones: readonly Zone[];
  readonly market: MarketContext;

  /**
   * The indicators the contributors read — as EXPLICIT SERIES, not a bag of
   * strings.
   *
   * ── Why this is not `Record<string, Maybe[]>` like everywhere else ──
   *
   * Because a bag of strings is how the replay silently produced zero setups.
   *
   * This platform has three consumers of indicators and they built their keys
   * three different ways: the strategy evaluator keys on the DOCUMENT's params
   * (`ema:period=200:4h`), the regime extractors key on the BARE NAME (`adx`), and
   * the risk engine keys on its own explicit params (`atr:period=14:1h`). A
   * contributor reaching into that record with a fourth convention
   * (`macd_histogram:fast=12,signal=9,slow=26:1h`) found nothing, returned null,
   * and silently contributed zero points — and the score would have been quietly
   * wrong in production while every test passed.
   *
   * A missing series must be IMPOSSIBLE TO OVERLOOK, not merely absent. So the
   * contributors take typed fields: a caller that forgets one does not get a
   * silent null, it gets a compile error.
   */
  readonly series: {
    readonly rsi: readonly Maybe[] | null;
    readonly macdHistogram: readonly Maybe[] | null;
    readonly atr: readonly Maybe[] | null;
  };

  /**
   * The Risk Engine's assessment.
   *
   * Contributors must read only the factors named in `SCOREABLE_RISK_FACTORS`.
   * The others (liquidity, spread, exchange) exist live and cannot exist in the
   * corpus, for the reason above.
   */
  readonly risk: RiskAssessment;

  /**
   * How many OTHER strategies produced a candidate on the same symbol,
   * timeframe and direction on this bar.
   *
   * Carried, reported — and worth exactly zero points until the uplift is
   * measured from outcomes (ADR-024 §6).
   */
  readonly agreeingStrategies: readonly string[];

  /**
   * The base the score starts from: this strategy's measured win rate in this
   * regime, frozen into the active calibration model. Null when no model exists,
   * in which case the neutral base is used and the report says so.
   */
  readonly historicalBase: { winRate: number; samples: number } | null;
}

/**
 * The risk factors a contributor may score on: the ones computable from candles
 * alone, and therefore present in the corpus as well as live.
 *
 * A factor NOT in this list is not unimportant — it is a veto concern, owned by
 * the Risk Engine, and it has already had its say by the time confidence runs.
 * There is a test asserting every risk validator is classified one way or the
 * other, so a new gate cannot be silently forgotten by the replay.
 */
export const SCOREABLE_RISK_FACTORS: ReadonlySet<string> = new Set([
  "candidate",
  "volatility",
  "regime",
  "risk/reward",
  "stop",
  "structure",
]);

/** The rest: real, vetoing, and invisible to history. */
export const MICROSTRUCTURE_RISK_FACTORS: ReadonlySet<string> = new Set([
  "liquidity",
  "spread",
  "exchange",
  "freshness",
  "correlation",
  "news",
  "portfolio",
  "derivatives",
]);

/**
 * One line of the score's arithmetic, and the thing that must be able to explain
 * itself.
 *
 * A contributor returns null when it has nothing to say — a pattern contributor
 * on a setup with no pattern, for instance. It does NOT return zero, because a
 * zero in the breakdown reads as "we looked and it was neutral", and that is a
 * different claim from "there was nothing here to look at".
 */
export interface IContributor {
  readonly name: string;
  contribute(context: ScoringContext): ConfidenceContributor | null;
}
