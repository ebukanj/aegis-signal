import { z } from "zod";
import {
  marketRegimeSchema,
  signalDirectionSchema,
  marketTypeSchema,
  timeframeSchema,
} from "./domain";
import { exchangeIdSchema } from "./enums/platform";
import { epochMsSchema, priceSchema, symbolSchema } from "./common/value-objects";

/**
 * A CANDIDATE — a strategy's documented conditions are satisfied.
 *
 * This is trading INTENT, not a trade. It is the first moment the platform has an
 * opinion, and it is deliberately the weakest one it will ever hold.
 *
 * ── What a candidate is NOT ──
 *
 * It carries **no confidence**. It has **no approval**. It has **not been risk
 * validated**, and it may never be published. The Risk Engine can kill it, and
 * killing it is not a failure of this engine — *the veto IS the product*
 * (AGENTS.md §1).
 *
 * A candidate says exactly one thing, and it is a narrow thing:
 *
 *     "Strategy X's rules, as written, are all true right now."
 *
 * Whether that is a trade worth taking is somebody else's job. Conflating the two
 * is how a platform ends up publishing every setup its strategies happen to like.
 */

/* ── Explanation ───────────────────────────────────────────────────── */

/**
 * One rule, and how it went.
 *
 * Every rule the evaluator touched is reported — the ones that passed, the ones that
 * failed, and the ones it never got to. **A candidate that only listed its
 * satisfied conditions would be marketing**, and a REJECTION that listed nothing at
 * all would be unanswerable: a trader watching a strategy go quiet for a week is
 * entitled to know which condition kept saying no.
 */
export const ruleOutcomeSchema = z.object({
  /** The rule, in plain trader English. `describeStrategy()` writes this. */
  description: z.string(),

  outcome: z.enum([
    "PASSED",
    "FAILED",

    /**
     * Never evaluated — an earlier rule had already failed.
     *
     * Reported rather than hidden, because "we stopped looking" and "we looked and
     * it was fine" are different facts, and a trader debugging a silent strategy
     * needs to know which one they are seeing.
     */
    "SKIPPED",

    /**
     * Could not be evaluated: the data was not there.
     *
     * NOT the same as FAILED, and the distinction is the difference between "the
     * market said no" and "we were blind". A strategy whose funding-rate condition
     * is UNAVAILABLE is not a strategy that was rejected — it is one that could not
     * run, and the operator needs to see that in the health metrics rather than in a
     * mysteriously low pass rate.
     */
    "UNAVAILABLE",
  ]),

  /**
   * The numbers behind the verdict. "RSI(14) was 27.4, the rule wanted below 30."
   *
   * The single most valuable string in this schema. `PASSED` alone asks to be
   * trusted; the actual reading can be argued with.
   */
  evidence: z.string(),
});
export type RuleOutcome = z.infer<typeof ruleOutcomeSchema>;

/**
 * Why the evaluator decided what it decided.
 *
 * Generated for candidates AND for rejections. This feeds the frontend's
 * explainability panel, and it is the thing that makes "here is why" more than a
 * marketing line (PRODUCT_BIBLE).
 */
export const evaluationExplanationSchema = z.object({
  entry: z.array(ruleOutcomeSchema),
  filters: z.array(ruleOutcomeSchema),

  /**
   * The regime gate — checked BEFORE any rule, and reported separately.
   *
   * A strategy that is simply in the wrong market has not "failed its conditions";
   * it was never allowed to ask. Reporting a regime block as a failed entry rule
   * would send a trader hunting through indicator thresholds for a problem that is
   * about the environment.
   */
  regime: z.object({
    regime: marketRegimeSchema,
    allowed: z.boolean(),
    reason: z.string(),
  }),

  /** Every indicator, pattern and regime the evaluation actually read. */
  evidenceUsed: z.array(z.string()),
});
export type EvaluationExplanation = z.infer<typeof evaluationExplanationSchema>;

/* ── The candidate ─────────────────────────────────────────────────── */

export const candidateSignalSchema = z
  .object({
    /** Deterministic: the same evaluation always produces the same id. */
    id: z.string(),

    strategyId: z.string(),
    /** The version whose rules fired. A settled trade must be traceable to them. */
    strategyVersion: z.number().int().positive(),
    /**
     * The fingerprint of those rules.
     *
     * A strategy can be edited tomorrow. When this candidate settles in a week, the
     * ledger must know which rules actually produced it — not which rules happen to
     * carry that name by then.
     */
    rulesHash: z.string(),

    symbol: symbolSchema,
    exchange: exchangeIdSchema,
    market: marketTypeSchema,
    timeframe: timeframeSchema,
    direction: signalDirectionSchema,

    /** The bar the rules fired on. Always a CLOSED bar. */
    barTime: epochMsSchema,
    evaluatedAt: epochMsSchema,

    entryPrice: priceSchema,

    /**
     * Where the strategy's document SAYS the stop goes — a PROPOSAL, nothing more.
     *
     * The Risk Engine owns the stop, the position size, the leverage and the market
     * type (AGENTS.md §2). It can move this, and it can refuse the trade entirely
     * because of where it sits. The evaluator computes it because the rule is
     * written in the document it is interpreting; it does not get to insist on it.
     *
     * The naming is not pedantry. A field called `stopLoss` here would be read
     * downstream as a decision, and something would eventually act on it without
     * asking the engine that is supposed to own it.
     */
    proposedStop: priceSchema,
    proposedTargets: z.array(priceSchema).min(1),

    /** The regime the market was in when it fired. Context travels with the intent. */
    regime: marketRegimeSchema,

    explanation: evaluationExplanationSchema,
  })
  .refine(
    (c) =>
      c.direction === "LONG"
        ? c.proposedStop < c.entryPrice
        : c.proposedStop > c.entryPrice,
    {
      message:
        "The stop is on the wrong side of the entry — a LONG stops below and a SHORT stops above. This is not a bad trade, it is an impossible one.",
      path: ["proposedStop"],
    },
  )
  .refine(
    (c) =>
      c.proposedTargets.every((t) =>
        c.direction === "LONG" ? t > c.entryPrice : t < c.entryPrice,
      ),
    {
      message:
        "A target sits on the losing side of the entry — it would be hit by the trade going wrong",
      path: ["proposedTargets"],
    },
  );
export type CandidateSignal = z.infer<typeof candidateSignalSchema>;

/**
 * The evaluator's verdict: a candidate, or the reason there is none.
 *
 * **A rejection is a first-class result, not an absence.** Returning `null` when a
 * strategy does not fire would throw away the most operationally useful thing the
 * engine knows: *which* condition said no. A strategy that has been silent for a
 * fortnight is either working perfectly or quietly broken, and only the explanation
 * can tell you which.
 *
 * Silence is a feature (AGENTS.md §1). Silence with no explanation is a bug.
 */
export const evaluationResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("candidate"),
    candidate: candidateSignalSchema,
  }),
  z.object({
    kind: z.literal("rejected"),
    strategyId: z.string(),
    symbol: symbolSchema,
    /** The FIRST rule that said no. Short, and the one a trader will read. */
    reason: z.string(),
    explanation: evaluationExplanationSchema,
  }),
]);
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
