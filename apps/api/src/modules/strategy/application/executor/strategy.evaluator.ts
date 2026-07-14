import { Injectable } from "@nestjs/common";
import {
  describeEntryRule,
  rulesHash,
  type CandidateSignal,
  type EntryRule,
  type EvaluationExplanation,
  type EvaluationResult,
  type RuleOutcome,
  type SignalDirection,
  type StrategyDefinition,
} from "@aegis/contracts";
import type { EvaluationContext } from "../../domain/evaluation-context";
import { ConditionExecutor } from "./condition.executor";
import { RegimeGate } from "./regime.gate";
import { TradePlanner } from "./trade.planner";

/**
 * THE DOCUMENT INTERPRETER.
 *
 * Search this file for the word "Breakout". For "Reversal". For any strategy's name.
 * They are not here, and they cannot be: this class has never heard of a strategy. It
 * knows a `StrategyDefinition` — a shape from the contract — and it knows how to
 * interpret one.
 *
 * **A new strategy is a new document. It is not a new code path.** That is ADR-023,
 * and it is the load-bearing decision of the entire platform: it is why a user can
 * invent a strategy and have it run on exactly the machinery the built-ins run on,
 * with exactly the same rigour, rather than on a second-class path somebody bolted on.
 *
 * The moment a `switch (strategy.id)` appears anywhere below this line, user
 * strategies become second-class citizens and the promise is broken.
 *
 * ── Where its responsibility ends ──
 *
 * It answers exactly one question: *"are this document's conditions satisfied?"*
 *
 * It does **not** assign confidence. It does **not** validate risk. It does **not**
 * publish. The Risk Engine can kill everything it produces, and that is not a failure
 * of this engine — the veto IS the product (AGENTS.md §1).
 */
@Injectable()
export class StrategyEvaluator {
  constructor(
    private readonly conditions: ConditionExecutor,
    private readonly regime: RegimeGate,
    private readonly planner: TradePlanner,
  ) {}

  evaluate(
    strategy: StrategyDefinition,
    context: EvaluationContext,
  ): EvaluationResult {
    /* ── The regime gate, FIRST ──────────────────────────────────── */

    /*
     * Before a single rule is read.
     *
     * A strategy in the wrong market has not "failed its conditions" — it was never
     * allowed to ask. Reporting a regime block as a failed entry rule would send a
     * trader hunting through indicator thresholds for a problem that is about the
     * environment, and they would never find it.
     *
     * It is also the cheap check. There is no sense computing a document's way through
     * fifteen conditions to discover that a mean-reversion strategy is standing in a
     * bull trend.
     */
    const gate = this.regime.check(strategy, context);

    if (!gate.allowed) {
      return {
        kind: "rejected",
        strategyId: strategy.id,
        symbol: context.symbol,
        reason: gate.reason,
        explanation: {
          entry: this.skipAll(strategy.entry),
          filters: this.skipAll(strategy.filters),
          regime: gate,
          evidenceUsed: [`regime: ${context.regime}`],
        },
      };
    }

    /* ── The rules ───────────────────────────────────────────────── */

    /*
     * Filters BEFORE entry, deliberately.
     *
     * Both must pass, so the order cannot change the verdict — but it changes the
     * EXPLANATION, and the explanation is the product. A filter is permission ("is the
     * 4h trend up?"); an entry rule is the setup ("has RSI dropped below 30?"). When a
     * strategy is silent because it lacked permission, that is what a trader needs to
     * be told first — not that some indicator threshold was not met on a trade they
     * were never allowed to take.
     */
    const filters = this.runAll(strategy.filters, context);
    const entry = this.runAll(strategy.entry, context);

    const explanation: EvaluationExplanation = {
      entry,
      filters,
      regime: gate,
      evidenceUsed: this.evidenceUsed(context),
    };

    const failed = [...filters, ...entry].find(
      (outcome) => outcome.outcome !== "PASSED",
    );

    if (failed) {
      return {
        kind: "rejected",
        strategyId: strategy.id,
        symbol: context.symbol,
        /*
         * The FIRST rule that said no, and the reason a trader will actually read.
         *
         * A rejection is a first-class result, not an absence. Returning nothing would
         * throw away the most operationally useful thing this engine knows: *which*
         * condition is keeping the strategy quiet. Silence is a feature; silence with
         * no explanation is a bug.
         */
        reason:
          failed.outcome === "UNAVAILABLE"
            ? `could not evaluate "${failed.description}" — ${failed.evidence}`
            : `"${failed.description}" — ${failed.evidence}`,
        explanation,
      };
    }

    /* ── Every rule passed ───────────────────────────────────────── */

    const direction = this.direction(strategy, context, entry);

    if (!direction) {
      /*
       * A `BOTH` strategy whose evidence does not say which way.
       *
       * The engine REFUSES rather than guessing. A coin-flip direction on a setup that
       * otherwise passed every rule is the most dangerous thing this platform could
       * produce: it would look exactly like a high-quality signal, and it would be
       * pointing at random.
       */
      return {
        kind: "rejected",
        strategyId: strategy.id,
        symbol: context.symbol,
        reason:
          "every rule passed, but nothing in the evidence says WHICH WAY — a direction guessed here would be a coin flip wearing a signal's clothes",
        explanation,
      };
    }

    const plan = this.planner.plan(strategy, context, direction);

    if (!plan) {
      return {
        kind: "rejected",
        strategyId: strategy.id,
        symbol: context.symbol,
        reason:
          "the rules passed, but the document's stop rule cannot produce a valid stop on this bar",
        explanation,
      };
    }

    const candidate: CandidateSignal = {
      id: this.id(strategy, context, direction),

      strategyId: strategy.id,
      strategyVersion: strategy.version,
      // The fingerprint of the rules that actually fired. The strategy may be edited
      // tomorrow; when this settles, the ledger must know which rules produced it.
      rulesHash: strategy.rulesHash ?? rulesHash(strategy),

      symbol: context.symbol,
      exchange: context.exchange as CandidateSignal["exchange"],
      market: strategy.market,
      timeframe: context.timeframe,
      direction,

      barTime: context.bar.time,
      evaluatedAt: context.bar.time,

      entryPrice: context.bar.close,
      proposedStop: plan.stop,
      proposedTargets: plan.targets,

      regime: context.regime,
      explanation,
    };

    return { kind: "candidate", candidate };
  }

  /* ── The rule language ───────────────────────────────────────────── */

  /**
   * Interpret one entry rule.
   *
   * A rule is a condition (optionally negated). An ANY-OF group passes when **any one**
   * of its options does.
   *
   * Note the group runs EVERY option even after one has passed. That is deliberate and
   * it costs nothing: the indicators are already computed, and the explanation is worth
   * more than the microsecond. A trader looking at *"a bull flag OR a falling wedge OR
   * an ascending triangle"* wants to know which one fired — and, when the group fails,
   * how close each of the three came.
   */
  private run(rule: EntryRule, context: EvaluationContext): RuleOutcome {
    const description = describeEntryRule(rule);

    if (rule.kind === "rule") {
      const outcome = this.conditions.execute(rule.condition, context);

      if (!rule.negate) return { ...outcome, description };

      /*
       * NEGATION, and the case that matters: an UNAVAILABLE condition stays
       * UNAVAILABLE.
       *
       * `NOT (something we could not measure)` is not TRUE. A strategy that said "do
       * not enter if there is a change of character" and could not detect patterns at
       * all would otherwise sail through its own safety check on the strength of being
       * blind — which is the exact opposite of what the rule was written to do.
       */
      if (outcome.outcome === "UNAVAILABLE" || outcome.outcome === "SKIPPED") {
        return { ...outcome, description };
      }

      return {
        description,
        outcome: outcome.outcome === "PASSED" ? "FAILED" : "PASSED",
        evidence: outcome.evidence,
      };
    }

    const results = rule.rules.map((r) => {
      const outcome = this.conditions.execute(r.condition, context);

      if (!r.negate) return outcome;
      if (outcome.outcome === "UNAVAILABLE") return outcome;

      return {
        ...outcome,
        outcome: (outcome.outcome === "PASSED" ? "FAILED" : "PASSED") as RuleOutcome["outcome"],
      };
    });

    const winner = results.find((r) => r.outcome === "PASSED");

    if (winner) {
      return { description, outcome: "PASSED", evidence: winner.evidence };
    }

    // Nothing passed. If we could not even LOOK at all of them, say so — a group that
    // reports FAILED when it was blind is a group that lies about the market.
    const allBlind = results.every((r) => r.outcome === "UNAVAILABLE");

    return {
      description,
      outcome: allBlind ? "UNAVAILABLE" : "FAILED",
      evidence: results.map((r) => r.evidence).join("; "),
    };
  }

  private runAll(rules: EntryRule[], context: EvaluationContext): RuleOutcome[] {
    return rules.map((rule) => this.run(rule, context));
  }

  /** The regime blocked it, so no rule was ever read. Reported, not hidden. */
  private skipAll(rules: EntryRule[]): RuleOutcome[] {
    return rules.map((rule) => ({
      description: describeEntryRule(rule),
      outcome: "SKIPPED" as const,
      evidence: "not evaluated — the strategy is not permitted in this market",
    }));
  }

  /* ── Direction ───────────────────────────────────────────────────── */

  /**
   * Which way?
   *
   * A `LONG` or `SHORT` strategy has already answered. A `BOTH` strategy has not — its
   * rules fired, but the document alone does not say which side of the market it is on.
   *
   * The evidence decides, in this order:
   *
   *   1. **A pattern that passed and has a direction.** A bull flag is long. This is
   *      the strongest and most specific signal available, and it is what a trader
   *      would use.
   *   2. **The regime.** In a bull trend, a `BOTH` strategy is long.
   *
   * If neither speaks, the engine REFUSES. It does not guess. A direction picked by
   * coin flip on a setup that passed every other rule would be indistinguishable from
   * a high-quality signal and would be pointing at random — the worst possible thing
   * this platform could emit.
   */
  private direction(
    strategy: StrategyDefinition,
    context: EvaluationContext,
    entry: RuleOutcome[],
  ): SignalDirection | null {
    if (strategy.direction !== "BOTH") return strategy.direction;

    // 1. A pattern that fired and knows which way it points.
    const patterns = Object.values(context.patterns).flat();

    const fired = entry
      .filter((o) => o.outcome === "PASSED")
      .flatMap((o) =>
        patterns.filter((p) => o.evidence.includes(p.pattern) && p.direction),
      );

    if (fired.length > 0) {
      const long = fired.filter((p) => p.direction === "LONG").length;
      const short = fired.filter((p) => p.direction === "SHORT").length;

      // Patterns disagreeing with each other is not a direction. It is an argument.
      if (long > short) return "LONG";
      if (short > long) return "SHORT";
      return null;
    }

    // 2. The regime.
    if (context.regime === "TRENDING_BULL") return "LONG";
    if (context.regime === "TRENDING_BEAR") return "SHORT";

    return null;
  }

  /* ── Identity ────────────────────────────────────────────────────── */

  /**
   * A deterministic id.
   *
   * The same strategy, the same symbol, the same bar → the same id, always. That is
   * what makes the pipeline **idempotent**: a worker that retries after a crash, or two
   * workers that race on the same closed candle, cannot produce two signals for one
   * setup. A random UUID here would let a restart double-publish a trade.
   */
  private id(
    strategy: StrategyDefinition,
    context: EvaluationContext,
    direction: SignalDirection,
  ): string {
    return [
      strategy.id,
      strategy.version,
      context.symbol,
      context.timeframe,
      direction,
      context.bar.time,
    ].join(":");
  }

  private evidenceUsed(context: EvaluationContext): string[] {
    return [
      ...Object.keys(context.indicators),
      ...Object.entries(context.patterns).flatMap(([tf, found]) =>
        found.map((p) => `${p.pattern}@${tf}`),
      ),
      `regime: ${context.regime}`,
    ];
  }
}
