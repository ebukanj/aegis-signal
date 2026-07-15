import { z } from "zod";
import {
  marketRegimeSchema,
  marketTypeSchema,
  riskLevelSchema,
  signalDirectionSchema,
  timeframeSchema,
} from "./domain";

/**
 * A strategy is a DOCUMENT, not code.
 *
 * This is the load-bearing decision of the whole platform (ADR-023). Every
 * strategy — the built-in ones and every strategy a user invents — is an
 * instance of the schema below. The backend therefore implements exactly ONE
 * thing: an evaluator that reads this document. Not eleven bespoke plugins.
 *
 * ADR-024 grows the *vocabulary* without touching the *architecture*. A strategy
 * can now say far more — MACD, KDJ, divergence, break of structure, a bull flag
 * — but it is still one document, read by one evaluator.
 */

/* ── Indicators ────────────────────────────────────────────────────── */

/**
 * Everything a condition may talk about. Closed on purpose: a fixed vocabulary
 * is what makes user-authored strategies deterministic and safe to run.
 */
export const indicatorSchema = z.enum([
  // price
  "open",
  "high",
  "low",
  "close",

  // volume
  "volume",
  "volume_sma",
  "obv", // on-balance volume
  "cvd", // cumulative volume delta — tells forced selling from conviction selling
  "vwap",

  // moving averages
  "sma",
  "ema",

  // momentum
  "rsi",
  "macd_line",
  "macd_signal",
  "macd_histogram",
  "stoch_k",
  "stoch_d",
  "kdj_k",
  "kdj_d",
  "kdj_j",
  "cci",
  "williams_r",
  "roc",
  "mfi",

  // trend
  "adx",
  "plus_di",
  "minus_di",
  "supertrend",
  "psar",
  "ichimoku_tenkan",
  "ichimoku_kijun",
  "ichimoku_span_a",
  "ichimoku_span_b",

  // volatility
  "atr",
  "bb_upper",
  "bb_middle",
  "bb_lower",
  "bb_width",
  "keltner_upper",
  "keltner_lower",
  "donchian_upper",
  "donchian_lower",

  // structure
  "highest_high",
  "lowest_low",

  // derivatives — PERPETUAL only, and blocked on a data feed we do not have
  "funding_rate",
  "open_interest",
  "long_short_ratio",

  // statistics
  "zscore",
]);
export type Indicator = z.infer<typeof indicatorSchema>;

/** Indicators that need a data feed the platform does not have yet. */
export const DERIVATIVES_INDICATORS: Indicator[] = [
  "funding_rate",
  "open_interest",
  "long_short_ratio",
];

/* ── Operators ─────────────────────────────────────────────────────── */

/**
 * The operators a condition may use.
 *
 * **One way to say each thing.** There is no `slope_positive` next to `rising`,
 * and no `inside_range` next to `between` — synonyms look generous and are a tax:
 * two operators that mean the same thing are two code paths to keep in agreement,
 * two entries in the strategy editor, and one day a bug in only one of them.
 */
export const operatorSchema = z.enum([
  "gt", // >
  "gte", // >=
  "lt", // <
  "lte", // <=

  /**
   * Exact equality — and a warning.
   *
   * `eq` on a *computed* indicator is almost always a mistake: an EMA is a float,
   * and floats are not equal to round numbers. It is meaningful against a
   * discrete operand (a Supertrend direction, a bar count), and treacherous
   * everywhere else. The evaluator compares with a tolerance rather than `===`
   * for exactly this reason.
   */
  "eq",
  "neq",

  "crosses_above",
  "crosses_below",

  /** Within [min, max], inclusive. The spec's "inside range" is this. */
  "between",
  /** Outside [min, max]. Not `!between` — an unset value is neither. */
  "outside_range",

  /**
   * Against the indicator's OWN mean over N bars.
   *
   * "RSI above its own average" adapts to the instrument; "RSI above 50" does
   * not. The right operand is the lookback N.
   */
  "above_average",
  "below_average",

  /** Slope over N bars: "MACD histogram rising for 3 bars". */
  "rising",
  "falling",

  /**
   * Divergence — price makes a lower low while the indicator makes a higher low.
   *
   * This is among the highest-value signals in trading and could not be
   * expressed at all before ADR-024. The right operand is the lookback in bars.
   */
  "diverges_bullish",
  "diverges_bearish",
]);
export type Operator = z.infer<typeof operatorSchema>;

/** These read the left operand over N bars; the right operand is that N. */
export const BAR_COUNT_OPERATORS: Operator[] = [
  "rising",
  "falling",
  "above_average",
  "below_average",
  "diverges_bullish",
  "diverges_bearish",
];

/** These take a [min, max] pair rather than a single value. */
export const RANGE_OPERATORS: Operator[] = ["between", "outside_range"];

/* ── Patterns ──────────────────────────────────────────────────────── */

/**
 * Chart patterns and market structure.
 *
 * These cannot be expressed as `[indicator] [operator] [value]` — they need
 * swing detection and geometry — so they are a condition kind of their own. The
 * backend gains a pattern library; the architecture does not change.
 *
 * Deliberately ABSENT: head & shoulders, cup & handle, Elliott waves. Ten
 * traders draw them ten different ways. A deterministic detector for them would
 * be *inventing* certainty, and inventing certainty is the one thing this
 * platform exists not to do (ADR-024).
 */
export const patternSchema = z.enum([
  // ── Market structure — objective. The highest-value group, and it tells you
  //    whether a trend is actually intact.
  "HIGHER_HIGH_HIGHER_LOW", // uptrend structure
  "LOWER_HIGH_LOWER_LOW", // downtrend structure
  "BREAK_OF_STRUCTURE", // trend continues: a swing point is taken out
  "CHANGE_OF_CHARACTER", // trend may be ending: the first counter-break
  "LIQUIDITY_SWEEP", // stops taken, then reclaimed
  "FAIR_VALUE_GAP", // an imbalance price tends to revisit
  "ORDER_BLOCK", // the candle that caused the move
  "RANGE", // no trend: a floor and a ceiling

  /**
   * Equal highs / equal lows — a liquidity pool, in plain sight.
   *
   * Two or more swings at the same price are two or more clusters of stop orders
   * sitting just beyond it. Objective: "within N% of each other" is a measurement,
   * not an interpretation.
   */
  "EQUAL_HIGHS",
  "EQUAL_LOWS",

  // ── Reversal shapes — objective enough to trust
  "DOUBLE_TOP",
  "DOUBLE_BOTTOM",
  "TRIPLE_TOP",
  "TRIPLE_BOTTOM",

  // ── Geometry — real, but tunable. Always quality-scored.
  "BULL_FLAG",
  "BEAR_FLAG",
  "PENNANT",
  "FALLING_WEDGE",
  "RISING_WEDGE",
  "ASCENDING_TRIANGLE",
  "DESCENDING_TRIANGLE",
  "SYMMETRICAL_TRIANGLE",
  "ASCENDING_CHANNEL",
  "DESCENDING_CHANNEL",
]);
export type Pattern = z.infer<typeof patternSchema>;

/**
 * STILL REFUSED, and this is not an oversight to be helpfully fixed:
 *
 *   head & shoulders · inverse head & shoulders · cup & handle ·
 *   rounded top / bottom · broadening wedge · Elliott waves
 *
 * Ten traders draw a neckline ten different ways. A "deterministic" detector for
 * these would not be detecting anything — it would be picking ONE arbitrary
 * interpretation, stamping a quality score on it, and presenting the result as a
 * measurement. That is manufacturing certainty, which is the single thing this
 * platform exists not to do (ADR-024).
 *
 * A broadening wedge is the wedge family's version of the same problem: its
 * trendlines diverge, so almost any choppy stretch of chart can be fitted to it.
 *
 * `pattern-result.spec.ts` asserts this. If a future milestone asks for them
 * again, that is a request to overturn ADR-024, and it needs an ADR — not a
 * quiet addition to this list.
 */

/** Patterns whose detection is geometric and therefore a matter of degree. */
export const GEOMETRIC_PATTERNS: Pattern[] = [
  "BULL_FLAG",
  "BEAR_FLAG",
  "PENNANT",
  "FALLING_WEDGE",
  "RISING_WEDGE",
  "ASCENDING_TRIANGLE",
  "DESCENDING_TRIANGLE",
  "SYMMETRICAL_TRIANGLE",
  "ASCENDING_CHANNEL",
  "DESCENDING_CHANNEL",
];

/**
 * Patterns that are objectively true or false — they happened, or they did not.
 *
 * These score `quality: 1` by definition. A break of structure is not "0.8 of a
 * break": price either took out the swing high or it did not. Scoring them on a
 * curve would be inventing doubt to look rigorous, which is the mirror image of
 * inventing certainty and just as dishonest.
 */
export const OBJECTIVE_PATTERNS: Pattern[] = [
  "HIGHER_HIGH_HIGHER_LOW",
  "LOWER_HIGH_LOWER_LOW",
  "BREAK_OF_STRUCTURE",
  "CHANGE_OF_CHARACTER",
  "FAIR_VALUE_GAP",
  "EQUAL_HIGHS",
  "EQUAL_LOWS",
];

/* ── Operands ──────────────────────────────────────────────────────── */

/** One side of a comparison: a fixed number, or a computed indicator. */
export const operandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("number"),
    value: z.number(),
  }),
  z.object({
    kind: z.literal("indicator"),
    indicator: indicatorSchema,
    /** Lookback period, e.g. RSI(14) → 14. Omitted for raw price/volume. */
    period: z.number().int().positive().optional(),
    /**
     * Evaluate on a different timeframe than the strategy's own — this is how a
     * 1h strategy asks "but is the 4h trend up?". Signals are multi-timeframe.
     */
    timeframe: timeframeSchema.optional(),
    /** Scales the result, e.g. volume_sma(20) × 1.5. */
    multiplier: z.number().positive().optional(),
    /**
     * Read the value from N bars BACK, not the current bar.
     *
     * ── Why this exists, and the tautology it kills ──
     *
     * A breakout is written `close > highest_high(20)`. But `highest_high(20)` at
     * bar i is the max high over the window ENDING AT i — which includes bar i's
     * own high. Since a candle's high is always ≥ its close, `close > highest_high`
     * is `close > max(…, thisBarsHigh)`, and that is **never true**. The condition
     * is tautologically false, the strategy never fires, and nothing explains why.
     *
     * The standard Donchian breakout compares the close against the extreme of the
     * bars BEFORE it: `close > highest_high(20) shifted by 1` = the highest high of
     * the 20 bars ending one bar ago. `shift: 1` makes that intent explicit in the
     * document rather than hiding it in the evaluator.
     *
     * It is deliberately NOT the default. `highest_high` used for a stop (the trade
     * planner) genuinely wants the inclusive extreme, and a silent lag there would
     * move every stop by a bar. The shift belongs to the comparison, so it is
     * stated at the comparison.
     */
    shift: z.number().int().nonnegative().optional(),
  }),
]);
export type Operand = z.infer<typeof operandSchema>;

/* ── Conditions ────────────────────────────────────────────────────── */

/** `left op right` — the ordinary case. */
export const comparisonConditionSchema = z.object({
  kind: z.literal("comparison"),
  left: operandSchema,
  op: operatorSchema,
  right: operandSchema,
  /** Upper bound — required by `between`, forbidden otherwise. */
  rightUpper: operandSchema.optional(),
});

/** "A bull flag is present, of at least this quality." */
export const patternConditionSchema = z.object({
  kind: z.literal("pattern"),
  pattern: patternSchema,
  /**
   * 0–1. How cleanly the shape must be formed before it counts.
   *
   * Objective structure (a break of structure either happened or it did not)
   * ignores this. Geometry — flags, wedges — is a matter of degree, and this is
   * the dial that decides how strict you want to be.
   */
  minQuality: z.number().min(0).max(1),
  timeframe: timeframeSchema.optional(),
});

export const conditionSchema = z
  .discriminatedUnion("kind", [
    comparisonConditionSchema,
    patternConditionSchema,
  ])
  .superRefine((condition, ctx) => {
    if (condition.kind !== "comparison") return;

    const wantsUpper =
      condition.op === "between" || condition.op === "outside_range";
    const hasUpper = condition.rightUpper !== undefined;

    if (wantsUpper !== hasUpper) {
      ctx.addIssue({
        code: "custom",
        message:
          "`between` and `outside_range` require an upper bound; every other operator forbids one",
        path: ["rightUpper"],
      });
    }
  });
export type Condition = z.infer<typeof conditionSchema>;
export type ComparisonCondition = z.infer<typeof comparisonConditionSchema>;
export type PatternCondition = z.infer<typeof patternConditionSchema>;

/* ── The entry language ────────────────────────────────────────────── */

/**
 * ONE condition, optionally negated.
 *
 * `negate` rather than a `NOT` node in a tree. It says the same thing, it renders
 * as a checkbox rather than a nested branch, and it cannot be nested wrongly.
 */
export const ruleSchema = z.object({
  kind: z.literal("rule"),
  condition: conditionSchema,
  /** "…is NOT true". */
  negate: z.boolean().default(false),
});
export type Rule = z.infer<typeof ruleSchema>;

/**
 * ANY of these. One level of OR, and one level only.
 *
 * This is what a strategy actually needs: *"a bull flag OR a falling wedge OR an
 * ascending triangle"* is Pattern Break, and it is a single OR. Anything deeper is
 * a thing traders describe by writing a second strategy.
 */
export const anyOfSchema = z.object({
  kind: z.literal("any_of"),
  /** Two or more. A one-item OR is a rule wearing a disguise. */
  rules: z.array(ruleSchema).min(2),
});
export type AnyOf = z.infer<typeof anyOfSchema>;

/**
 * An entry rule: a single condition, or a group where any one will do.
 *
 * ── Why the nesting stops HERE ──
 *
 * Milestone 07's brief asked for unlimited depth: `A AND (B OR C) AND NOT D AND
 * (E OR (F AND G))`. The evaluator could support that in an afternoon — a
 * recursive tree is not hard.
 *
 * The reason it does not is [ADR-023](../../docs/adr/ADR-023-strategy-as-document.md),
 * and it is the load-bearing rule of the entire platform: **a strategy is a
 * document, and a user-created one takes the identical code path as a built-in.**
 *
 * If the evaluator understands logic the strategy EDITOR cannot render, then
 * built-in strategies can use nesting and user strategies cannot. Worse — a user
 * opening a nested built-in in a flat editor would have it **silently flattened**,
 * and would then be trading rules nobody wrote. That is not hypothetical: this
 * codebase already shipped an editor that rendered `0` where an indicator operand
 * belonged, so touching a strategy would quietly turn *"price above the highest
 * high"* into *"price above 0"*.
 *
 * **The document language is exactly what the editor can express.** Not a subset,
 * not a superset. That constraint is a feature, and the day it stops being true,
 * ADR-023 becomes a slogan.
 *
 * `entry` is the AND of these. Nesting depth: one.
 */
export const entryRuleSchema = z.discriminatedUnion("kind", [
  ruleSchema,
  anyOfSchema,
]);
export type EntryRule = z.infer<typeof entryRuleSchema>;

/** Every condition an entry rule touches, flattened. Used by the resolver. */
export function conditionsOf(rule: EntryRule): Condition[] {
  return rule.kind === "rule"
    ? [rule.condition]
    : rule.rules.map((r) => r.condition);
}

/* ── Exit rules ────────────────────────────────────────────────────── */

/** Where the stop goes. The stop defines the risk, and therefore the size. */
export const stopRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("atr"),
    period: z.number().int().positive(),
    multiplier: z.number().positive(),
  }),
  z.object({
    kind: z.literal("percent"),
    value: z.number().positive(),
  }),
  /** Below the lowest low (LONG) / above the highest high (SHORT). */
  z.object({
    kind: z.literal("structure"),
    lookback: z.number().int().positive(),
  }),
]);
export type StopRule = z.infer<typeof stopRuleSchema>;

/**
 * A take-profit, expressed in R — multiples of the distance to the stop — so a
 * target is always stated relative to the risk taken to reach it.
 */
export const targetRuleSchema = z.object({
  rMultiple: z.number().positive(),
  /** Portion of the position to close here, 1–100. Must total ≤ 100. */
  closePercent: z.number().min(1).max(100),
});
export type TargetRule = z.infer<typeof targetRuleSchema>;

/* ── The strategy document ─────────────────────────────────────────── */

export const strategyOriginSchema = z.enum(["BUILT_IN", "CUSTOM"]);
export type StrategyOrigin = z.infer<typeof strategyOriginSchema>;

/**
 * Live track record. This is what makes a confidence score mean something
 * (ADR-023): the platform earns trust from realised outcomes, not assertions.
 * `null` for a strategy that has not produced a settled signal yet.
 */
export const strategyRecordSchema = z.object({
  signals: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  /** Realised expectancy in R. Negative ⇒ the strategy must auto-disable. */
  expectancy: z.number(),
  avgR: z.number(),
});
export type StrategyRecord = z.infer<typeof strategyRecordSchema>;

export const strategyDefinitionSchema = z
  .object({
    id: z.string(),
    /** Plain trader English. "Breakout", not "Ignition". */
    name: z.string().min(1),
    /** One sentence a trader understands without a manual. */
    summary: z.string().min(1),

    origin: strategyOriginSchema,
    enabled: z.boolean(),

    /**
     * THE VERSION. Bumped whenever the RULES change — never for a rename.
     *
     * ── Why a strategy that is edited loses its record ──
     *
     * Confidence must be EARNED (ADR-024). A strategy's track record is evidence
     * about a specific set of rules, and the moment those rules change it is
     * evidence about nothing: a 61% win rate produced by an RSI(14) threshold of 30
     * says nothing whatsoever about the same strategy at 25.
     *
     * Carrying the record across an edit would let a trader tune a strategy until it
     * looked good and inherit the confidence of the version that actually earned it.
     * That is fabricated confidence with extra steps, and it is exactly what this
     * platform killed once already.
     *
     * So editing the rules resets `record` to null and the strategy is UNPROVEN
     * again. The codebase already said this out loud, about copies: *"A copy has
     * earned nothing. It starts UNPROVEN."* An edit is a copy that overwrote its
     * parent.
     *
     * Renaming it, or fixing a typo in the summary, changes nothing — those are not
     * rules, and pretending they are would make the platform unusable.
     */
    version: z.number().int().positive().default(1),

    /**
     * A fingerprint of the EVALUABLE parts, and only those.
     *
     * `rulesHash(strategy)` computes it. Two strategies with the same hash will
     * behave identically on the same candles, whatever they are called — which is
     * what makes it safe to reset the record on a change and safe NOT to on a
     * rename.
     *
     * Also the version-safety guarantee the brief asks for: a signal records the
     * hash of the rules that produced it, so a settled trade can always be traced
     * back to the exact document that fired it, even after the strategy has moved on.
     */
    rulesHash: z.string().optional(),

    direction: z.union([signalDirectionSchema, z.literal("BOTH")]),
    market: marketTypeSchema,
    timeframe: timeframeSchema,

    /**
     * THE MARKETS THIS STRATEGY IS FOR. Declared by the strategy, not by the engine.
     *
     * A strategy that prints money in a trend gets shredded in a range, and the
     * difference is the environment's fault rather than the strategy's. So every
     * strategy states the environments it belongs in, and the Regime Engine simply
     * publishes what the environment IS. It never decides which strategy suits it.
     *
     * ── Why this lives HERE and not in the Regime Engine ──
     *
     * The obvious alternative is a regime → strategy lookup table inside the engine.
     * It is faster to write and it quietly breaks the one rule ADR-023 exists to
     * protect: **a strategy is a document, and a user-created one takes the identical
     * code path as a built-in.** A strategy the engine has never heard of could never
     * appear in a hardcoded map, so every user strategy would be permanently
     * invisible to the regime filter — or, worse, silently treated as compatible with
     * everything.
     *
     * Empty means "no regime restriction", which is a real and legitimate answer for
     * a strategy that genuinely does not care.
     */
    regimes: z.array(marketRegimeSchema).default([]),

    /**
     * Markets this strategy must NOT be run in, whatever else agrees.
     *
     * Separate from `regimes` rather than inferred as its complement, because those
     * are different claims. "I work in a trend" is not the same as "I am actively
     * dangerous in a range" — the first is a preference, the second is a veto. A
     * mean-reversion strategy in a strong trend does not merely underperform; it
     * sells every new high all the way up.
     */
    avoidRegimes: z.array(marketRegimeSchema).default([]),

    /**
     * ALL of these must be true to enter. Never empty.
     *
     * Each is a single rule, or an ANY-OF group. The AND is implicit — a strategy
     * whose entry conditions were OR-ed together would fire on its weakest one, and
     * a rule you would not take alone is not a rule you should take at all.
     */
    entry: z.array(entryRuleSchema).min(1),

    /**
     * Additional gates — higher-timeframe trend, liquidity. May be empty.
     *
     * Identical machinery to `entry`, and a deliberately different NAME. Both must
     * pass, so the evaluator treats them the same; the split exists so a trader can
     * see at a glance which rules are the SETUP and which are the permission to take
     * it. "RSI below 30" is why you are here. "The 4h trend is up" is whether you are
     * allowed to be.
     */
    filters: z.array(entryRuleSchema),

    stop: stopRuleSchema,
    /** Ordered, nearest first. Must total ≤ 100% of the position. */
    targets: z.array(targetRuleSchema).min(1),

    /** Percent of account equity risked per trade. */
    riskPercent: z.number().positive().max(5),
    /** Null for SPOT. */
    maxLeverage: z.number().int().positive().nullable(),
    riskLevel: riskLevelSchema,

    /**
     * Null until the strategy has settled signals. A strategy with no record is
     * UNPROVEN: it may emit signals, but never a Prime one (ADR-023).
     */
    record: strategyRecordSchema.nullable(),
  })
  .refine((s) => s.targets.reduce((sum, t) => sum + t.closePercent, 0) <= 100, {
    message: "Targets cannot close more than 100% of the position",
    path: ["targets"],
  })
  .refine((s) => (s.market === "PERPETUAL") === (s.maxLeverage !== null), {
    message:
      "PERPETUAL strategies need a leverage cap; SPOT must not have one",
    path: ["maxLeverage"],
  })
  .refine((s) => s.market === "PERPETUAL" || s.direction !== "SHORT", {
    message: "A SHORT strategy must be PERPETUAL — spot cannot be shorted",
    path: ["direction"],
  });
export type StrategyDefinition = z.infer<typeof strategyDefinitionSchema>;

/** A strategy with no settled signals cannot be trusted with a Prime slot. */
export function isProven(strategy: StrategyDefinition): boolean {
  return strategy.record !== null && strategy.record.signals > 0;
}

/* ── Versioning ────────────────────────────────────────────────────── */

/**
 * The parts of a strategy that change what it DOES.
 *
 * Everything a trader can change without changing a single trade the strategy would
 * have taken is deliberately absent: `name`, `summary`, `enabled`, `origin`,
 * `record`, `version`, `riskLevel`.
 *
 * `riskPercent` and `maxLeverage` ARE here, and that is worth a sentence. They do
 * not change *whether* the strategy fires — but they change the size of every
 * position it takes, so a win rate earned at 1% risk is not evidence about the same
 * rules at 4%. The record has to reset.
 */
function evaluableParts(
  strategy: Omit<StrategyDefinition, "version" | "rulesHash">,
) {
  return {
    direction: strategy.direction,
    market: strategy.market,
    timeframe: strategy.timeframe,
    regimes: [...strategy.regimes].sort(),
    avoidRegimes: [...strategy.avoidRegimes].sort(),
    entry: strategy.entry,
    filters: strategy.filters,
    stop: strategy.stop,
    targets: strategy.targets,
    riskPercent: strategy.riskPercent,
    maxLeverage: strategy.maxLeverage,
  };
}

/**
 * A stable fingerprint of what the strategy will actually DO.
 *
 * Deterministic across processes and machines: keys are sorted at every level, so
 * two documents that differ only in the order their JSON happened to be written
 * hash identically. Without that, a round-trip through a database or a form would
 * "change" the rules and silently wipe a strategy's record.
 *
 * FNV-1a rather than a crypto hash: this is a change-detector, not a security
 * boundary, and it must run in the browser as cheaply as on the server. Nobody is
 * attacking it — the failure mode we care about is a collision by accident, and
 * 32 bits is ample for the number of strategies a human will ever write.
 */
export function rulesHash(
  strategy: Omit<StrategyDefinition, "version" | "rulesHash">,
): string {
  const canonical = stableStringify(evaluableParts(strategy));

  let hash = 0x811c9dc5;

  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

/** JSON with every object's keys sorted, at every depth. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);

  return `{${entries.join(",")}}`;
}

/**
 * Has this strategy's behaviour changed?
 *
 * The one question that decides whether a record survives an edit.
 */
export function rulesChanged(
  before: StrategyDefinition,
  after: StrategyDefinition,
): boolean {
  return rulesHash(before) !== rulesHash(after);
}

/**
 * Apply an edit honestly.
 *
 * If the rules changed: bump the version, stamp the new hash, and **wipe the
 * record**. The strategy is UNPROVEN again, because its past results were produced
 * by rules that no longer exist.
 *
 * If they did not: nothing happens beyond the rename. A trader must be able to fix
 * a typo without being punished for it.
 */
export function applyEdit(
  before: StrategyDefinition,
  after: StrategyDefinition,
): StrategyDefinition {
  if (!rulesChanged(before, after)) {
    return { ...after, version: before.version, rulesHash: rulesHash(before), record: before.record };
  }

  return {
    ...after,
    version: before.version + 1,
    rulesHash: rulesHash(after),
    // It has earned nothing. Whatever it earned belonged to a different strategy.
    record: null,
  };
}

/** Every condition a strategy touches, across entry and filters, flattened. */
export function allConditions(strategy: StrategyDefinition): Condition[] {
  return [...strategy.entry, ...strategy.filters].flatMap(conditionsOf);
}

/** True when a strategy needs the derivatives feed we do not have yet. */
export function needsDerivativesFeed(strategy: StrategyDefinition): boolean {
  return allConditions(strategy).some(
    (c) =>
      c.kind === "comparison" &&
      [c.left, c.right, c.rightUpper].some(
        (operand) =>
          operand?.kind === "indicator" &&
          (DERIVATIVES_INDICATORS as string[]).includes(operand.indicator),
      ),
  );
}
