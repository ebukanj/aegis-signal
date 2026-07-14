import { z } from "zod";
import { marketRegimeSchema, timeframeSchema } from "../domain";
import { epochMsSchema } from "../common/value-objects";

/**
 * What kind of market are we trading right now?
 *
 * Not an indicator. **Context.** A strategy that prints money in a trend gets
 * shredded in a range, and the difference is not the strategy's fault — it is the
 * environment's. Everything downstream (Strategy, Risk, Confidence, the Prime
 * budget) is entitled to know which environment it is standing in before it
 * decides anything.
 *
 * ── TWO AXES, and why one label was never enough ──
 *
 * Milestone 06's brief asked for ten regimes, "mutually exclusive at a given
 * timeframe": Bull Trend, Bear Trend, Sideways, Transition, High Volatility, Low
 * Volatility, Breakout, Breakdown, Expansion, Compression.
 *
 * **They are not mutually exclusive.** A market ripping upward on 3× normal range
 * is a bull trend AND it is high volatility. Both statements are true, and forcing
 * a single winner means the classifier has to rank *"is this bull, or is this
 * volatile?"* — a question with no principled answer. Whatever tiebreak it used
 * would be a rule somebody invented, presented as a measurement.
 *
 * So there are two axes, and a market has a value on each:
 *
 *   DIRECTION   — where is it going?   (trending bull, trending bear, range, …)
 *   VOLATILITY  — how violently?       (compressed, normal, expanded)
 *
 * "TRENDING_BULL, EXPANDED" is a sentence that is true. "Bull Trend" alone throws
 * away the half a trader most needs for sizing.
 *
 * ── What is deliberately NOT here ──
 *
 * **Breakout and Breakdown.** The Pattern Engine already emits them
 * (`BREAK_OF_STRUCTURE`, `RANGE`, `LIQUIDITY_SWEEP`). Re-minting them as regimes
 * would mean the same evidence arriving twice under two names — and the Confluence
 * layer counting it twice. M05's false-positive work ended with exactly this
 * warning: *confluence must weight by quality, never by count.*
 */

/* ── The volatility axis ───────────────────────────────────────────── */

export const volatilityStateSchema = z.enum([
  /**
   * Coiled. Ranges are contracting and the market is storing energy.
   *
   * The most actionable volatility state, and the least dramatic-looking. A
   * squeeze does not tell you which way — it tells you a move is coming, and that
   * stops can be tight because the market is not yet paying you to be wide.
   */
  "COMPRESSED",

  /** Ordinary. The instrument is behaving like itself. */
  "NORMAL",

  /**
   * Expanded. Ranges are 2× normal or worse.
   *
   * **The state that most often costs money**, because every stop distance
   * calibrated on yesterday's range is now inside the noise. The Risk Engine must
   * see this: the correct response to expanded volatility is a WIDER stop and a
   * SMALLER position, and a platform that reports only "bull trend" gives it no
   * way to know.
   */
  "EXPANDED",
]);
export type VolatilityState = z.infer<typeof volatilityStateSchema>;

/* ── Evidence ──────────────────────────────────────────────────────── */

/**
 * One piece of evidence, and what it was worth.
 *
 * The regime is a weighted vote, and this is one voter's ballot — named, scored,
 * and explained in a sentence a trader can disagree with.
 */
export const regimeEvidenceSchema = z.object({
  /** "trend", "momentum", "volatility", "volume", "structure". */
  feature: z.string(),

  /**
   * −1 to +1. Positive is bullish, negative is bearish, zero is no opinion.
   *
   * Signed rather than absolute, because a feature that ARGUES AGAINST the
   * classification is the most important thing this object can carry. An engine
   * that reports only what agreed with it is not reasoning, it is confirming.
   */
  score: z.number().min(-1).max(1),

  /** How much this feature counted. Sums to 1 across all of them. */
  weight: z.number().min(0).max(1),

  /** Plain English. "ADX is 34 and rising — the trend has force behind it." */
  detail: z.string(),
});
export type RegimeEvidence = z.infer<typeof regimeEvidenceSchema>;

/* ── The classification ────────────────────────────────────────────── */

/**
 * A regime, on one timeframe.
 *
 * ── `agreement` is NOT a probability, and that distinction is the whole file ──
 *
 * The brief asked for "Probability" and showed an example reading **91%**. That is
 * the same 91% this platform already killed once (ADR-024).
 *
 * A probability is a falsifiable claim: *"when I say 91%, I am right 91% of the
 * time."* You can check it. You can plot it. You can be caught lying by it.
 *
 * **There is no ground truth for a market regime.** Nobody can tell you what regime
 * the market "really" was in on 14 March — there is no oracle, no settlement, no
 * resolved outcome. So a regime probability is not merely *uncalibrated*; it is
 * **unfalsifiable by construction.** It could never be checked, which means it
 * could never be wrong, which means it means nothing.
 *
 * What CAN be stated honestly is how much of the evidence agrees. That is
 * `agreement`: a weighted vote, 0–1, with every voter's ballot attached. It says
 * *"four of my five features point bull, and here is the one that does not."*
 * That is a claim a human can argue with, which is the only kind worth making.
 *
 * It is stamped `UNCALIBRATED` and it always will be — not because we have not got
 * round to calibrating it, but because there is nothing to calibrate it against.
 */
export const regimeClassificationSchema = z
  .object({
    timeframe: timeframeSchema,

    /** The direction axis. The contract's existing vocabulary. */
    direction: marketRegimeSchema,
    /** The volatility axis. Orthogonal, and both are always true at once. */
    volatility: volatilityStateSchema,

    /**
     * 0–1. How much of the weighted evidence agrees with `direction`.
     *
     * **NOT a probability.** See the note above. Read it as "how unanimous", never
     * as "how likely to be right".
     */
    agreement: z.number().min(0).max(1),

    /**
     * Always `UNCALIBRATED`, and structurally so.
     *
     * A literal rather than a boolean, so that anything rendering this has to
     * acknowledge it exists. A `calibrated: false` flag is a thing people forget to
     * check; a field whose only possible value is the word UNCALIBRATED is a thing
     * they cannot.
     */
    calibration: z.literal("UNCALIBRATED"),

    /** Every feature that voted FOR this classification. */
    supporting: z.array(regimeEvidenceSchema),

    /**
     * Every feature that voted AGAINST it. **Required, and it may be empty only
     * when nothing disagreed.**
     *
     * The most valuable field here. "TRENDING_BULL, agreement 0.7" tells a trader
     * nothing they can act on; *"trending bull, but volume has been contracting for
     * six bars and momentum is diverging"* tells them exactly what they are taking
     * on. It is also the earliest visible sign of a regime about to turn — the
     * contradictions pile up long before the label flips.
     */
    contradicting: z.array(regimeEvidenceSchema),

    /** When this classification was made (the last CLOSED bar). */
    at: epochMsSchema,

    /**
     * How many consecutive bars this direction has held.
     *
     * A regime one bar old is a guess. A regime that has held for forty bars is a
     * fact about the market. Nothing downstream can tell them apart without this,
     * and a strategy sizing into a "trend" that started this morning is sizing into
     * a coin flip.
     */
    barsHeld: z.number().int().nonnegative(),
  })
  .refine((r) => r.supporting.length > 0 || r.direction === "TRANSITION", {
    message:
      "A classification with no supporting evidence is not a classification — only TRANSITION may be reached by having nothing to say",
    path: ["supporting"],
  });
export type RegimeClassification = z.infer<typeof regimeClassificationSchema>;

/* ── Multi-timeframe ───────────────────────────────────────────────── */

/**
 * The whole picture: every timeframe, and whether they agree.
 *
 * ── Alignment is worth more than any single timeframe ──
 *
 * A 15m bull signal inside a 4h downtrend is a bounce, and it is the single most
 * expensive trade a retail trader makes: the lower timeframe looks perfect right up
 * until the higher timeframe reasserts itself. `conflict` is what makes that
 * visible, and the Risk Engine is entitled to veto on it.
 */
export const marketContextSchema = z
  .object({
    symbol: z.string(),

    /**
     * One classification per timeframe — and **partial**, deliberately.
     *
     * A coin listed last week has no meaningful daily regime, because it has barely
     * any daily candles. The honest response is for `1d` to be ABSENT, not to be
     * present with a fabricated classification built on nine bars.
     *
     * A full `Record` would force every timeframe to exist and quietly invite exactly
     * that fabrication.
     */
    timeframes: z.partialRecord(timeframeSchema, regimeClassificationSchema),

    /**
     * 0–1. How much the timeframes agree with each other.
     *
     * 1.0 means every timeframe reads the same direction — a market with nothing to
     * argue about, which is rare and worth a great deal when it happens.
     */
    alignment: z.number().min(0).max(1),

    /**
     * 0–1. How much the HIGHER timeframes contradict the lower ones.
     *
     * Deliberately not just `1 - alignment`. Two timeframes disagreeing matters far
     * more when the bigger one is the dissenter: the daily overrules the 15m, never
     * the other way round. This is weighted so that a 4h/1d objection counts for
     * more than a 15m one, because that is how markets actually work.
     */
    conflict: z.number().min(0).max(1),

    /** The timeframe a strategy asked about. Its regime is the operative one. */
    primary: timeframeSchema,

    at: epochMsSchema,
  })
  .refine((c) => Object.keys(c.timeframes).length > 0, {
    message: "A market context with no timeframes classified is not a context",
    path: ["timeframes"],
  });
export type MarketContext = z.infer<typeof marketContextSchema>;

/* ── Transitions ───────────────────────────────────────────────────── */

/**
 * A regime change.
 *
 * Published as an event, because the platform genuinely needs to WAKE UP for these:
 * a strategy that was compatible five minutes ago may not be now, and an open
 * position sized for a compressed market is now sitting in an expanded one.
 */
export const regimeTransitionSchema = z.object({
  symbol: z.string(),
  timeframe: timeframeSchema,

  from: marketRegimeSchema,
  to: marketRegimeSchema,

  /** How long the OLD regime lasted. A one-bar regime was never a regime. */
  previousBarsHeld: z.number().int().nonnegative(),

  agreement: z.number().min(0).max(1),
  at: epochMsSchema,

  /** Why it turned. The contradictions that finally won. */
  reason: z.array(z.string()),
});
export type RegimeTransition = z.infer<typeof regimeTransitionSchema>;
