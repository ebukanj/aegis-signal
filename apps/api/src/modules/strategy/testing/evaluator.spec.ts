import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BUILT_IN_STRATEGIES,
  indicatorKey,
  strategyById,
  type Candle,
  type DetectedPattern,
  type Rule,
  type MarketContext,
  type StrategyDefinition,
} from "@aegis/contracts";
import { StrategyEvaluator } from "../application/executor/strategy.evaluator";
import { ConditionExecutor } from "../application/executor/condition.executor";
import { RegimeGate } from "../application/executor/regime.gate";
import { TradePlanner } from "../application/executor/trade.planner";
import { DependencyResolver } from "../application/resolver/dependency.resolver";
import { OperatorEvaluator } from "../../indicators/application/services/operator.evaluator";
import { DivergenceEngine } from "../../indicators/application/services/divergence.engine";
import { CompatibilityService } from "../../regime/application/services/compatibility.service";
import type { EvaluationContext } from "../domain/evaluation-context";
import type { Maybe } from "../../indicators/application/math/rolling";

/**
 * The Strategy Evaluator.
 *
 * One test in this file matters more than all the others, and it is the first one.
 */

const resolver = new DependencyResolver();

const evaluator = new StrategyEvaluator(
  new ConditionExecutor(new OperatorEvaluator(), new DivergenceEngine(), resolver),
  new RegimeGate(new CompatibilityService()),
  new TradePlanner(),
);

/* ── THE TEST THAT DEFINES THE MILESTONE ───────────────────────────── */

describe("there is NO strategy-specific code. Anywhere.", () => {
  /**
   * ADR-023, enforced by grep.
   *
   * The brief says it plainly: the evaluator must never contain
   * `if (strategy == "Ignition")`, a `switch (strategy)`, or a strategy-specific class.
   *
   * A code review can promise that. This test PROVES it, on every commit, forever —
   * because the moment one `switch (strategy.id)` appears, user-created strategies
   * become second-class citizens running on a path nobody maintains, and ADR-023 stops
   * being a decision and becomes a slogan.
   *
   * It reads the module's own source. There is nowhere to hide.
   */
  const sourceRoot = join(__dirname, "..");

  function everySourceFile(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);

      if (statSync(path).isDirectory()) return everySourceFile(path);
      if (!path.endsWith(".ts") || path.includes("testing")) return [];

      return [path];
    });
  }

  const files = everySourceFile(sourceRoot);

  it("reads its own source — and there is source to read", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(BUILT_IN_STRATEGIES.map((s) => s.id))(
    "no file in the module mentions the strategy id %s",
    (id) => {
      for (const file of files) {
        const source = readFileSync(file, "utf-8");

        expect(
          source.includes(`"${id}"`) || source.includes(`'${id}'`),
          `${file} names the strategy "${id}". The evaluator must not know which strategy it is running.`,
        ).toBe(false);
      }
    },
  );

  it.each(BUILT_IN_STRATEGIES.map((s) => s.name))(
    "no file in the module mentions the strategy name %s",
    (name) => {
      for (const file of files) {
        const source = readFileSync(file, "utf-8");
        const code = source
          // Comments may name a strategy to EXPLAIN something. Code may not.
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/\/\/.*$/gm, "");

        expect(
          code.includes(`"${name}"`) || code.includes(`'${name}'`),
          `${file} names the strategy "${name}" in CODE.`,
        ).toBe(false);
      }
    },
  );

  it("no file switches on a strategy id", () => {
    for (const file of files) {
      const code = readFileSync(file, "utf-8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(
        /switch\s*\(\s*strategy\s*\.\s*(id|name)/.test(code),
        `${file} switches on a strategy's identity.`,
      ).toBe(false);

      expect(
        /strategy\s*\.\s*(id|name)\s*===/.test(code),
        `${file} branches on a strategy's identity.`,
      ).toBe(false);
    }
  });
});

/* ── Test scaffolding ──────────────────────────────────────────────── */

const HOUR = 3_600_000;
const START = Date.UTC(2026, 0, 1);

function candles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    time: START + i * HOUR,
    open: i === 0 ? close : closes[i - 1],
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 1_000,
    takerBuyVolume: 600,
  }));
}

/** A context built by hand, so a test can state exactly what the market is. */
function contextFor(input: {
  indicators?: Record<string, Maybe[]>;
  patterns?: DetectedPattern[];
  regime?: MarketContext["timeframes"]["1h"] extends infer _ ? string : never;
  conflict?: number;
  bars?: number[];
}): EvaluationContext {
  const bars = candles(input.bars ?? Array.from({ length: 60 }, (_, i) => 100 + i));
  const regime = (input.regime ?? "TRENDING_BULL") as never;

  const classification = {
    timeframe: "1h" as const,
    direction: regime,
    volatility: "NORMAL" as const,
    agreement: 0.8,
    calibration: "UNCALIBRATED" as const,
    supporting: [{ feature: "trend", score: 0.8, weight: 1, detail: "up" }],
    contradicting: [],
    at: bars.at(-1)!.time,
    barsHeld: 20,
  };

  return Object.freeze({
    symbol: "BTC",
    exchange: "BINANCE",
    timeframe: "1h",
    candles: { "1h": bars, "4h": bars },
    indicators: input.indicators ?? {},
    patterns: { "1h": input.patterns ?? [], "4h": input.patterns ?? [] },
    market: {
      symbol: "BTC",
      timeframes: { "1h": classification },
      alignment: 1,
      conflict: input.conflict ?? 0,
      primary: "1h",
      at: bars.at(-1)!.time,
    } as MarketContext,
    regime,
    bar: bars.at(-1)!,
  });
}

const flat = (value: number, length = 60): Maybe[] =>
  new Array<Maybe>(length).fill(value);

/** A minimal, valid strategy. Tests vary one thing at a time from this. */
function strategy(overrides: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    id: "test",
    name: "Test",
    summary: "A strategy that exists only in this test file.",
    origin: "CUSTOM",
    enabled: true,
    version: 1,
    direction: "LONG",
    market: "PERPETUAL",
    timeframe: "1h",
    regimes: [],
    avoidRegimes: [],
    entry: [
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
    filters: [],
    stop: { kind: "percent", value: 2 },
    targets: [{ rMultiple: 2, closePercent: 100 }],
    riskPercent: 1,
    maxLeverage: 3,
    riskLevel: "MODERATE",
    record: null,
    ...overrides,
  } as StrategyDefinition;
}

const RSI_14 = indicatorKey({ indicator: "rsi", timeframe: "1h", params: { period: 14 } });

/* ── Interpreting the document ─────────────────────────────────────── */

describe("the evaluator interprets a document", () => {
  it("produces a CANDIDATE when every rule passes", () => {
    const result = evaluator.evaluate(
      strategy(),
      contextFor({ indicators: { [RSI_14]: flat(24) } }),
    );

    expect(result.kind).toBe("candidate");

    if (result.kind !== "candidate") return;

    expect(result.candidate.direction).toBe("LONG");
    expect(result.candidate.strategyVersion).toBe(1);
    expect(result.candidate.explanation.entry[0].outcome).toBe("PASSED");

    // The working, shown. "PASSED" asks to be trusted; the reading can be argued with.
    expect(result.candidate.explanation.entry[0].evidence).toContain("24");
  });

  it("REJECTS with the reason, never with silence", () => {
    /*
     * A rejection is a first-class result.
     *
     * Returning nothing would throw away the most operationally useful thing this
     * engine knows: WHICH condition said no. A strategy silent for a fortnight is
     * either working perfectly or quietly broken, and only this can tell you which.
     */
    const result = evaluator.evaluate(
      strategy(),
      contextFor({ indicators: { [RSI_14]: flat(62) } }),
    );

    expect(result.kind).toBe("rejected");

    if (result.kind !== "rejected") return;

    expect(result.reason).toContain("RSI");
    expect(result.reason).toContain("62");
    expect(result.explanation.entry[0].outcome).toBe("FAILED");
  });

  it("reports UNAVAILABLE, not FAILED, when it could not see", () => {
    /*
     * The difference between "the market said no" and "we were blind".
     *
     * A strategy reporting FAILED when its indicator was never computed would show a
     * mysteriously low pass rate with nothing to explain it, and an operator would go
     * looking for a market problem that does not exist.
     */
    const result = evaluator.evaluate(strategy(), contextFor({ indicators: {} }));

    expect(result.kind).toBe("rejected");

    if (result.kind !== "rejected") return;

    expect(result.explanation.entry[0].outcome).toBe("UNAVAILABLE");
    expect(result.reason).toContain("could not evaluate");
  });

  it("is DETERMINISTIC — same document, same market, same candidate id", () => {
    // Idempotency. A worker that retries after a crash, or two workers racing on the
    // same closed bar, must not produce two signals for one setup.
    const context = contextFor({ indicators: { [RSI_14]: flat(24) } });

    const a = evaluator.evaluate(strategy(), context);
    const b = evaluator.evaluate(strategy(), context);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/* ── The entry language ────────────────────────────────────────────── */

describe("the entry language", () => {
  const rsiBelow = (value: number): Rule => ({
    kind: "rule",
    negate: false,
    condition: {
      kind: "comparison",
      left: { kind: "indicator", indicator: "rsi", period: 14 },
      op: "lt",
      right: { kind: "number", value },
    },
  });

  it("ALL-OF: every rule must pass", () => {
    const s = strategy({
      entry: [
        rsiBelow(30),
        {
          kind: "rule",
          negate: false,
          condition: {
            kind: "comparison",
            left: { kind: "indicator", indicator: "adx", period: 14 },
            op: "gte",
            right: { kind: "number", value: 25 },
          },
        },
      ],
    });

    const adx = indicatorKey({ indicator: "adx", timeframe: "1h", params: { period: 14 } });

    // RSI passes, ADX does not. The AND must fail.
    const result = evaluator.evaluate(
      s,
      contextFor({ indicators: { [RSI_14]: flat(24), [adx]: flat(12) } }),
    );

    expect(result.kind).toBe("rejected");
  });

  it("ANY-OF: one option is enough", () => {
    const s = strategy({
      entry: [
        {
          kind: "any_of",
          rules: [
            rsiBelow(20), // will fail — RSI is 24
            rsiBelow(30), // will pass
          ],
        },
      ],
    });

    const result = evaluator.evaluate(
      s,
      contextFor({ indicators: { [RSI_14]: flat(24) } }),
    );

    expect(result.kind).toBe("candidate");
  });

  it("ANY-OF fails only when EVERY option fails", () => {
    const s = strategy({
      entry: [
        {
          kind: "any_of",
          rules: [rsiBelow(20), rsiBelow(25)],
        },
      ],
    });

    const result = evaluator.evaluate(
      s,
      contextFor({ indicators: { [RSI_14]: flat(40) } }),
    );

    expect(result.kind).toBe("rejected");

    // And it reports what EACH option said — a trader wants to know how close it came.
    if (result.kind !== "rejected") return;
    expect(result.explanation.entry[0].evidence.split(";").length).toBe(2);
  });

  it("NOT inverts a rule", () => {
    const s = strategy({
      entry: [{ ...rsiBelow(30), negate: true }],
    });

    // RSI is 24, so "RSI < 30" is TRUE, so "NOT (RSI < 30)" must be FALSE.
    const result = evaluator.evaluate(
      s,
      contextFor({ indicators: { [RSI_14]: flat(24) } }),
    );

    expect(result.kind).toBe("rejected");

    // And with RSI at 62 the negation passes.
    const passing = evaluator.evaluate(
      s,
      contextFor({ indicators: { [RSI_14]: flat(62) } }),
    );

    expect(passing.kind).toBe("candidate");
  });

  it("NOT of an UNAVAILABLE condition is NOT TRUE", () => {
    /*
     * The case that would quietly disarm a safety rule.
     *
     * A strategy that says "do NOT enter if there is a change of character" and cannot
     * detect patterns at all must not sail through its own safety check on the strength
     * of being blind. That is the exact opposite of what the rule was written to do.
     */
    const s = strategy({
      entry: [
        {
          kind: "rule",
          negate: true,
          condition: {
            kind: "comparison",
            left: { kind: "indicator", indicator: "cci", period: 20 },
            op: "gt",
            right: { kind: "number", value: 100 },
          },
        },
      ],
    });

    const result = evaluator.evaluate(s, contextFor({ indicators: {} }));

    expect(result.kind).toBe("rejected");

    if (result.kind !== "rejected") return;
    expect(result.explanation.entry[0].outcome).toBe("UNAVAILABLE");
  });
});

/* ── The regime gate ───────────────────────────────────────────────── */

describe("the regime gate runs BEFORE any rule", () => {
  it("blocks a strategy that declared this regime as one to AVOID", () => {
    const s = strategy({ avoidRegimes: ["TRENDING_BULL"] });

    const result = evaluator.evaluate(
      s,
      contextFor({ indicators: { [RSI_14]: flat(24) }, regime: "TRENDING_BULL" }),
    );

    expect(result.kind).toBe("rejected");

    if (result.kind !== "rejected") return;

    // Every rule is SKIPPED, not FAILED. A strategy in the wrong market has not failed
    // its conditions — it was never allowed to ask.
    expect(result.explanation.entry[0].outcome).toBe("SKIPPED");
    expect(result.explanation.regime.allowed).toBe(false);
  });

  it("VETOES on higher-timeframe conflict — that trade is a bounce", () => {
    /*
     * Every rule can pass on the 1h while the daily screams the other way. That is the
     * most expensive trade in retail: the lower timeframe looks perfect right up until
     * the higher one reasserts itself.
     */
    const result = evaluator.evaluate(
      strategy(),
      contextFor({ indicators: { [RSI_14]: flat(24) }, conflict: 0.9 }),
    );

    expect(result.kind).toBe("rejected");

    if (result.kind !== "rejected") return;
    expect(result.reason).toContain("bounce");
  });
});

/* ── Direction ─────────────────────────────────────────────────────── */

describe("direction is DERIVED from evidence, never guessed", () => {
  it("REFUSES a BOTH strategy when nothing says which way", () => {
    /*
     * The most dangerous thing this platform could emit: a setup that passed every rule,
     * pointing in a direction chosen by coin flip. It would be indistinguishable from a
     * high-quality signal.
     */
    const s = strategy({ direction: "BOTH" });

    const result = evaluator.evaluate(
      s,
      contextFor({ indicators: { [RSI_14]: flat(24) }, regime: "RANGE" }),
    );

    expect(result.kind).toBe("rejected");

    if (result.kind !== "rejected") return;
    expect(result.reason).toContain("coin flip");
  });

  it("takes direction from the REGIME when the rules do not say", () => {
    const s = strategy({ direction: "BOTH" });

    const result = evaluator.evaluate(
      s,
      contextFor({ indicators: { [RSI_14]: flat(24) }, regime: "TRENDING_BULL" }),
    );

    expect(result.kind).toBe("candidate");
    if (result.kind !== "candidate") return;

    expect(result.candidate.direction).toBe("LONG");
  });
});

/* ── The trade plan ────────────────────────────────────────────────── */

describe("the trade plan is a PROPOSAL — the Risk Engine owns the stop", () => {
  it("a LONG stops below the entry and targets above it", () => {
    const result = evaluator.evaluate(
      strategy(),
      contextFor({ indicators: { [RSI_14]: flat(24) } }),
    );

    expect(result.kind).toBe("candidate");
    if (result.kind !== "candidate") return;

    const { entryPrice, proposedStop, proposedTargets } = result.candidate;

    expect(proposedStop).toBeLessThan(entryPrice);
    expect(proposedTargets[0]).toBeGreaterThan(entryPrice);
  });

  it("targets are stated in R — 2R is twice the distance to the stop", () => {
    const result = evaluator.evaluate(
      strategy({ targets: [{ rMultiple: 2, closePercent: 100 }] }),
      contextFor({ indicators: { [RSI_14]: flat(24) } }),
    );

    if (result.kind !== "candidate") throw new Error("expected a candidate");

    const { entryPrice, proposedStop, proposedTargets } = result.candidate;
    const risk = entryPrice - proposedStop;

    expect(proposedTargets[0] - entryPrice).toBeCloseTo(risk * 2, 6);
  });

  it("REFUSES a plan whose stop would sit on the entry", () => {
    // A zero-risk trade is not a gift, it is a divide-by-zero: (equity × risk%) / 0
    // hands back an infinite position size, and it looks like the best trade the
    // platform has ever seen right up to the liquidation.
    const result = evaluator.evaluate(
      strategy({ stop: { kind: "percent", value: 0.0000001 } }),
      contextFor({ indicators: { [RSI_14]: flat(24) } }),
    );

    // Either it rejects, or the risk is genuinely non-zero. It must never emit a
    // candidate whose stop equals its entry.
    if (result.kind === "candidate") {
      expect(result.candidate.proposedStop).not.toBe(result.candidate.entryPrice);
    }
  });
});

/* ── The six real documents ────────────────────────────────────────── */

describe("every built-in strategy runs on the identical machinery", () => {
  it("resolves the dependencies of all six without knowing what they are", () => {
    for (const s of BUILT_IN_STRATEGIES) {
      const dependencies = resolver.resolve(s);

      // Its own timeframe, always.
      expect(dependencies.timeframes).toContain(s.timeframe);

      // Every indicator instance is uniquely keyed — ema(50) and ema(200) must not
      // collide, or a strategy would be handed the wrong one.
      const keys = dependencies.indicators.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("Trend Pullback asks for a HIGHER timeframe than its own", () => {
    // Multi-timeframe resolution, on a real document. A 15m strategy that never looks up
    // is a strategy that buys bounces in downtrends.
    const s = strategyById("trend-pullback")!;
    const dependencies = resolver.resolve(s);

    expect(dependencies.timeframes.length).toBeGreaterThan(1);
  });

  it("does not compute the same indicator twice", () => {
    // A document mentioning RSI(14) five times must compute it once.
    const s = strategy({
      entry: [
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
        {
          kind: "rule",
          negate: false,
          condition: {
            kind: "comparison",
            left: { kind: "indicator", indicator: "rsi", period: 14 },
            op: "gt",
            right: { kind: "number", value: 10 },
          },
        },
      ],
    });

    const dependencies = resolver.resolve(s);
    const rsis = dependencies.indicators.filter((d) => d.indicator === "rsi");

    expect(rsis).toHaveLength(1);
  });

  it("a MULTIPLIER does not create a second indicator", () => {
    /*
     * "volume above average volume × 1.5" scales the RESULT. The underlying series is
     * the same 20-period average whether a rule multiplies it or not, so computing it
     * twice under two keys would waste the work and miss the cache.
     */
    const s = strategy({
      entry: [
        {
          kind: "rule",
          negate: false,
          condition: {
            kind: "comparison",
            left: { kind: "indicator", indicator: "volume" },
            op: "gte",
            right: {
              kind: "indicator",
              indicator: "volume_sma",
              period: 20,
              multiplier: 1.5,
            },
          },
        },
        {
          kind: "rule",
          negate: false,
          condition: {
            kind: "comparison",
            left: { kind: "indicator", indicator: "volume" },
            op: "gte",
            right: { kind: "indicator", indicator: "volume_sma", period: 20 },
          },
        },
      ],
    });

    const dependencies = resolver.resolve(s);
    const smas = dependencies.indicators.filter((d) => d.indicator === "volume_sma");

    expect(smas).toHaveLength(1);
  });
});
