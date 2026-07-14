import type {
  Candle,
  DetectedPattern,
  MarketStructure,
  RegimeEvidence,
} from "@aegis/contracts";
import type { Maybe } from "../../indicators/application/math/rolling";

/**
 * A market context FEATURE.
 *
 * The regime is a weighted vote. This is one voter: it looks at one aspect of the
 * market, and returns a **signed** opinion between −1 (emphatically bearish) and
 * +1 (emphatically bullish), with a sentence explaining itself.
 *
 * ── Signed, and that is the entire design ──
 *
 * The obvious alternative is for each feature to return "how bullish" as a 0–1
 * score and let the classifier decide. It is worse, and subtly: a feature that
 * cannot express DISAGREEMENT can only ever confirm. An engine built from
 * confirming voters will classify a market as bullish and quietly discard the
 * volume that has been collapsing for six bars — and the collapsing volume is the
 * single most useful thing it knows.
 *
 * A signed score means a feature can vote against the majority, and the
 * classification carries that dissent all the way out to the trader as
 * `contradicting`. **The contradictions are worth more than the label.**
 */
export interface FeatureInput {
  readonly candles: readonly Candle[];

  /** Everything the Indicator Engine computed, by name. Values may be null. */
  readonly indicators: Readonly<Record<string, readonly Maybe[]>>;

  /** Everything the Pattern Engine found. */
  readonly patterns: readonly DetectedPattern[];
  readonly structure: MarketStructure;
}

export interface IFeatureExtractor {
  /** "trend", "momentum", "volatility", "volume", "structure". */
  readonly name: string;

  /**
   * @returns a signed opinion, or `null` when the feature genuinely cannot tell.
   *
   * **Null is not zero.** Zero means "I looked, and the market is balanced" — an
   * opinion. Null means "I could not see" — the EMA has not warmed up, the
   * indicator is missing, there is not enough history. A classifier that treats the
   * two the same will average a missing feature into the vote as neutral, and a
   * regime built on features that were never computed is a regime built on nothing,
   * reported with total confidence.
   */
  extract(input: FeatureInput): FeatureOpinion | null;
}

export interface FeatureOpinion {
  /** −1 (bearish) … +1 (bullish). */
  score: number;
  /** Plain English, in a trader's words. Becomes `evidence.detail`. */
  detail: string;
}

/** A feature's opinion, once the classifier has weighted it. */
export function toEvidence(
  name: string,
  opinion: FeatureOpinion,
  weight: number,
): RegimeEvidence {
  return {
    feature: name,
    score: clamp(opinion.score, -1, 1),
    weight,
    detail: opinion.detail,
  };
}

export function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(low, Math.min(high, value));
}

/** The last non-null value of a series, or null. */
export function latest(series: readonly Maybe[] | undefined): number | null {
  if (!series) return null;

  for (let i = series.length - 1; i >= 0; i--) {
    const value = series[i];
    if (value !== null && value !== undefined) return value;
  }

  return null;
}

/** The value `back` bars ago, skipping nothing. Null if undefined there. */
export function at(
  series: readonly Maybe[] | undefined,
  back: number,
): number | null {
  if (!series) return null;

  const index = series.length - 1 - back;
  if (index < 0) return null;

  return series[index] ?? null;
}
