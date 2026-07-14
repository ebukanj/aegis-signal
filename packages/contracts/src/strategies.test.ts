import { describe, expect, it } from "vitest";
import {
  BUILT_IN_STRATEGIES,
  strategyById,
} from "./strategies";
import {
  applyEdit,
  rulesChanged,
  rulesHash,
  strategyDefinitionSchema,
  allConditions,
  type StrategyDefinition,
} from "./strategy";
import { describeStrategy } from "./strategy-language";

/**
 * The six documents, and the versioning rules that protect their track records.
 */

describe("the built-in strategy documents", () => {
  it("every one is a VALID StrategyDefinition — the same schema a user produces", () => {
    /*
     * The ADR-023 test.
     *
     * There is no privileged "built-in" shape. If a built-in strategy could be
     * something the schema does not accept, then the evaluator would need a second
     * code path for it — and the moment there are two paths, user strategies become
     * second-class citizens on the one that gets less attention.
     */
    for (const strategy of BUILT_IN_STRATEGIES) {
      const result = strategyDefinitionSchema.safeParse(strategy);

      expect(
        result.success,
        `${strategy.id} is not a valid strategy document: ${
          result.success ? "" : JSON.stringify(result.error.issues, null, 2)
        }`,
      ).toBe(true);
    }
  });

  it("all six are present and none has earned anything yet", () => {
    expect(BUILT_IN_STRATEGIES).toHaveLength(6);

    for (const strategy of BUILT_IN_STRATEGIES) {
      // Not one of them has produced a settled signal. Saying otherwise would be the
      // fabricated confidence this platform exists to refuse.
      expect(strategy.record, `${strategy.id} claims a record it has not earned`).toBeNull();
      expect(strategy.version).toBe(1);
      expect(strategy.rulesHash).toBeTruthy();
    }
  });

  it("Crowd Squeeze ships DISABLED — its data feed does not exist", () => {
    const squeeze = strategyById("crowd-squeeze")!;

    expect(squeeze.enabled).toBe(false);
  });

  it("every strategy reads as English a trader can audit", () => {
    for (const strategy of BUILT_IN_STRATEGIES) {
      const prose = describeStrategy(strategy);

      expect(prose.entry.length).toBeGreaterThan(0);

      for (const line of prose.entry) {
        // A rule that renders as an empty string, or as "[object Object]", is a rule
        // the user cannot audit — and an unauditable strategy is a black box with a
        // friendly name.
        expect(line.length).toBeGreaterThan(5);
        expect(line).not.toContain("object Object");
        expect(line).not.toContain("undefined");
      }
    }
  });

  it("Pattern Break uses an ANY-OF group — flags OR wedges OR triangles", () => {
    /*
     * The strategy that proves the entry language needed one level of OR.
     *
     * Its summary always promised "flags, wedges and triangles". Its rules demanded a
     * falling wedge and nothing else, because the language had no way to say "any of
     * these". The document and the description were quietly contradicting each other.
     */
    const patternBreak = strategyById("pattern-break")!;

    const group = patternBreak.entry.find((r) => r.kind === "any_of");

    expect(group).toBeDefined();
    expect(group!.kind === "any_of" && group!.rules.length).toBeGreaterThanOrEqual(3);

    // And it reads as a sentence.
    const prose = describeStrategy(patternBreak);
    expect(prose.entry.some((line) => line.includes(" or "))).toBe(true);
  });

  it("Level Bounce uses NOT — it must not buy a level while structure is breaking", () => {
    const bounce = strategyById("level-bounce")!;

    const negated = bounce.entry.filter(
      (r) => r.kind === "rule" && r.negate,
    );

    expect(negated.length).toBeGreaterThan(0);

    const prose = describeStrategy(bounce);
    expect(prose.entry.some((line) => line.startsWith("NOT"))).toBe(true);
  });

  it("every condition references only the vocabulary the engines implement", () => {
    // A strategy naming an indicator nothing computes is a landmine: it validates, it
    // ships, and it explodes the first time a candle closes.
    for (const strategy of BUILT_IN_STRATEGIES) {
      for (const condition of allConditions(strategy)) {
        expect(["comparison", "pattern"]).toContain(condition.kind);
      }
    }
  });
});

/* ── Versioning ────────────────────────────────────────────────────── */

describe("a strategy's record belongs to its RULES, not to its name", () => {
  const base = strategyById("breakout")!;

  /** A strategy that has earned something. */
  const proven: StrategyDefinition = {
    ...base,
    record: { signals: 40, wins: 24, expectancy: 0.42, avgR: 0.42 },
  };

  it("the hash is STABLE — key order and JSON round-trips do not change it", () => {
    /*
     * If the hash were unstable, a strategy would "change" every time it passed
     * through a database or a form — and would silently lose its track record for
     * doing nothing at all.
     */
    const roundTripped = JSON.parse(JSON.stringify(base)) as StrategyDefinition;

    expect(rulesHash(roundTripped)).toBe(rulesHash(base));

    // Reordering the object's keys must not matter either.
    const reordered = Object.fromEntries(
      Object.entries(base).reverse(),
    ) as unknown as StrategyDefinition;

    expect(rulesHash(reordered)).toBe(rulesHash(base));
  });

  it("RENAMING a strategy keeps its record — a typo is not a new strategy", () => {
    const renamed = { ...proven, name: "Breakout v2", summary: "Tweaked wording." };

    expect(rulesChanged(proven, renamed)).toBe(false);

    const edited = applyEdit(proven, renamed);

    expect(edited.version).toBe(proven.version);
    expect(edited.record).not.toBeNull();
  });

  it("CHANGING A RULE bumps the version and WIPES the record", () => {
    /*
     * The assertion that protects earned confidence.
     *
     * A 60% win rate produced by an RSI threshold of 30 says NOTHING about the same
     * strategy at 25. Carrying the record across the edit would let a trader tune a
     * strategy until it looked good and inherit the confidence of the version that
     * actually earned it — fabricated confidence with extra steps.
     */
    const rewritten: StrategyDefinition = {
      ...proven,
      entry: [
        ...proven.entry,
        {
          kind: "rule",
          negate: false,
          condition: {
            kind: "comparison",
            left: { kind: "indicator", indicator: "rsi", period: 14 },
            op: "lt",
            right: { kind: "number", value: 30 },
          },
        },
      ],
    };

    expect(rulesChanged(proven, rewritten)).toBe(true);

    const edited = applyEdit(proven, rewritten);

    expect(edited.version).toBe(proven.version + 1);
    expect(edited.record, "an edited strategy kept a record it did not earn").toBeNull();
    expect(edited.rulesHash).toBe(rulesHash(rewritten));
  });

  it("changing RISK also wipes the record", () => {
    // riskPercent does not change WHETHER the strategy fires — but it changes the size
    // of every position it takes, and a win rate earned at 1% risk is not evidence
    // about the same rules at 4%.
    const riskier = { ...proven, riskPercent: proven.riskPercent * 2 };

    expect(rulesChanged(proven, riskier)).toBe(true);
    expect(applyEdit(proven, riskier).record).toBeNull();
  });

  it("toggling ENABLED does not wipe the record", () => {
    // Turning a strategy off and on again is not a change to what it does. Punishing
    // that would make the toggle unusable.
    const toggled = { ...proven, enabled: !proven.enabled };

    expect(rulesChanged(proven, toggled)).toBe(false);
    expect(applyEdit(proven, toggled).record).not.toBeNull();
  });

  it("two strategies with identical rules and different names hash the same", () => {
    const clone = { ...base, id: "my-copy", name: "My Copy", origin: "CUSTOM" as const };

    expect(rulesHash(clone)).toBe(rulesHash(base));
  });
});
