import { describe, expect, it } from "vitest";
import type { Candle, LabelledSetup } from "@aegis/contracts";

import {
  DEFAULT_CONFIDENCE_POLICY,
  assertConfidencePolicyCoherent,
} from "../confidence.policy";
import { blend, shrink } from "../application/bayesian/beta";
import {
  fitIsotonic,
  fitPlatt,
  fitShrinkage,
} from "../application/calibration/calibrators";
import {
  baselineBrier,
  reliability,
  type Prediction,
} from "../application/reliability/reliability";
import { label } from "../infrastructure/replay/outcome.labeller";
import { SimilarityEngine } from "../application/similarity/similarity.engine";
import {
  ALL_VALIDATORS,
  HISTORICALLY_REPLAYABLE,
  REQUIRES_LIVE_MARKET,
} from "../../risk/application/validators";

/* ── Fixtures ──────────────────────────────────────────────────────── */

const candle = (o: number, h: number, l: number, c: number): Candle => ({
  time: 0,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 100,
  takerBuyVolume: null,
});

const setup = (
  score: number,
  outcome: LabelledSetup["outcome"],
  over: Partial<LabelledSetup["evidence"]> = {},
  split: LabelledSetup["split"] = "CALIBRATION",
): LabelledSetup => ({
  evidence: {
    strategyId: "breakout",
    rulesHash: "v1",
    symbol: "BTC",
    exchange: "BINANCE",
    timeframe: "1h",
    direction: "LONG",
    regime: "TRENDING_BULL",
    volatilityState: "NORMAL",
    volatilityBucket: "NORMAL",
    liquidityBucket: "DEEP",
    riskLevel: "LOW",
    patterns: [],
    score,
    ...over,
  },
  barTime: 1_700_000_000_000,
  entryPrice: 100,
  stopPrice: 98,
  targetPrice: 106,
  outcome,
  realisedR: outcome === "WIN" ? 3 : outcome === "LOSS" ? -1 : 0,
  barsHeld: 10,
  split,
});

/* ══════════════════════════════════════════════════════════════════════
 *  THE ARITHMETIC THAT STOPS A LUCKY STREAK BECOMING A CLAIM
 * ══════════════════════════════════════════════════════════════════════ */

describe("Bayesian shrinkage", () => {
  it("REFUSES to turn three wins from three into a 100% win rate", () => {
    /*
     * The single most important test in this milestone.
     *
     * Three coin flips landing heads happens one time in eight with a fair coin.
     * A platform that reports it as a 100% win rate has told a lie that is
     * arithmetically correct, which is the most dangerous kind.
     */
    const posterior = shrink(3, 3, 0.4, 20);

    expect(posterior.observed).toBe(1);
    expect(posterior.mean).toBeLessThan(0.55);
    expect(posterior.mean).toBeGreaterThan(0.4);
  });

  it("releases its grip as real evidence accumulates", () => {
    const three = shrink(3, 3, 0.4, 20);
    const fifty = shrink(50, 50, 0.4, 20);
    const thousand = shrink(1000, 1000, 0.4, 20);

    /* Each is a 100% observed rate. The BELIEF differs, and it should. */
    expect(three.mean).toBeLessThan(fifty.mean);
    expect(fifty.mean).toBeLessThan(thousand.mean);
    expect(thousand.mean).toBeGreaterThan(0.95);
  });

  it("widens the interval when it does not know", () => {
    const thin = shrink(3, 5, 0.4, 20);
    const thick = shrink(300, 500, 0.4, 20);

    expect(thin.high - thin.low).toBeGreaterThan(thick.high - thick.low);
  });

  it("refuses incoherent counts rather than quietly computing something", () => {
    expect(() => shrink(5, 3, 0.4, 20)).toThrow(/not a thing that can have happened/);
  });
});

describe("the blend of history and live", () => {
  it("reports UNCALIBRATED and a NULL rate when there is nothing at all", () => {
    /*
     * The state the platform is in TODAY. It must not return the global base rate
     * here — that would put a plausible number in front of a question nobody has
     * answered.
     */
    const result = blend(null, { wins: 0, samples: 0 }, 0.4, 20, 30);

    expect(result.basis).toBe("UNCALIBRATED");
    expect(result.rate).toBeNull();
  });

  it("is HISTORICAL when only the replay has spoken", () => {
    const result = blend({ wins: 600, samples: 1000 }, { wins: 0, samples: 0 }, 0.4, 20, 30);

    expect(result.basis).toBe("HISTORICAL");
    expect(result.rate).toBeCloseTo(0.59, 1);
  });

  it("DROPS history entirely once live results dominate", () => {
    /*
     * ADR-024: "after roughly 30 live signals for a score bucket, live dominates
     * and history is dropped."
     *
     * History says 90%. Our own signals say 40%. Once there are enough of them,
     * the backtest does not get a vote — because a backtest can be re-run until it
     * flatters and a live result cannot.
     */
    const result = blend(
      { wins: 900, samples: 1000 },
      { wins: 12, samples: 30 },
      0.4,
      20,
      30,
    );

    expect(result.basis).toBe("LIVE");
    expect(result.rate).toBeLessThan(0.5);
  });

  it("lets live outcomes pull a flattering backtest toward reality", () => {
    const optimistic = blend(
      { wins: 900, samples: 1000 },
      { wins: 2, samples: 10 },
      0.4,
      20,
      30,
    );

    expect(optimistic.basis).toBe("BLENDED");
    /* History claimed 90%. Ten live setups won 20%. The truth is dragged down. */
    expect(optimistic.rate).toBeLessThan(0.9);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  THE LABELLER — WHERE A BACKTEST LIES
 * ══════════════════════════════════════════════════════════════════════ */

describe("the outcome labeller", () => {
  it("counts a bar that touched BOTH the stop and the target as a LOSS", () => {
    /*
     * The single most consequential line in the milestone.
     *
     * An hourly candle whose high cleared the target and whose low broke the stop
     * tells us both prices traded. It does NOT tell us in which order, and OHLC
     * discards the path that would.
     *
     * Calling it a win inflates every number the platform will ever print — and it
     * inflates them worst for the tight-stop, near-target setups an optimiser
     * would then select for. We take the loss, because we cannot know, and a
     * platform whose premise is "measured, never asserted" does not get to resolve
     * its own ambiguities in its own favour.
     */
    const straddle = [candle(100, 107, 97, 101)];

    const result = label(straddle, "LONG", 100, 98, 106, 72);

    expect(result.outcome).toBe("LOSS");
    expect(result.realisedR).toBe(-1);
  });

  it("counts an unresolved setup as EXPIRED — and EXPIRED is a NON-WIN", () => {
    /*
     * Dropping these from the corpus — keeping every trade that worked and
     * discarding the ones that went nowhere — is the oldest way in the world to
     * manufacture a win rate.
     */
    const nothing = Array.from({ length: 80 }, () => candle(100, 101, 99, 100));

    const result = label(nothing, "LONG", 100, 98, 106, 72);

    expect(result.outcome).toBe("EXPIRED");
    expect(result.outcome).not.toBe("WIN");
    expect(result.barsHeld).toBe(72);
  });

  it("finds the target when the target really did come first", () => {
    const rally = [candle(100, 103, 99.5, 102), candle(102, 107, 101, 106)];

    const result = label(rally, "LONG", 100, 98, 106, 72);

    expect(result.outcome).toBe("WIN");
    expect(result.realisedR).toBeCloseTo(3, 5);
    expect(result.barsHeld).toBe(2);
  });

  it("refuses a zero-risk setup rather than dividing by zero", () => {
    expect(() => label([], "LONG", 100, 100, 106, 72)).toThrow(/no risk/);
  });

  it("mirrors correctly for a SHORT", () => {
    const drop = [candle(100, 100.5, 93, 94)];

    const result = label(drop, "SHORT", 100, 102, 94, 72);

    expect(result.outcome).toBe("WIN");
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  THE CALIBRATORS — AND THE ONE THAT MUST BE CAUGHT LYING
 * ══════════════════════════════════════════════════════════════════════ */

describe("the calibrators", () => {
  /** A scorer that genuinely works: higher score → higher win rate. */
  const honestCorpus = (): Prediction[] => {
    const rows: Prediction[] = [];
    let seed = 42;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let i = 0; i < 2000; i += 1) {
      const score = 40 + Math.floor(random() * 55);
      const trueRate = 0.2 + (score - 40) * 0.008;
      rows.push({
        score,
        outcome: random() < trueRate ? 1 : 0,
        predicted: 0,
      });
    }
    return rows;
  };

  it("SHRINKAGE degrades gracefully — a bucket of 2 returns nearly the base rate", () => {
    const sparse: Prediction[] = [
      { score: 90, outcome: 1, predicted: 0 },
      { score: 91, outcome: 1, predicted: 0 },
      ...Array.from({ length: 100 }, (_, i) => ({
        score: 50 + (i % 5),
        outcome: (i % 5 === 0 ? 1 : 0) as 0 | 1,
        predicted: 0,
      })),
    ];

    const calibrator = fitShrinkage(sparse, 5, 20);

    /* Two setups both won. Shrinkage must NOT report 100%. */
    expect(calibrator.apply(90)).toBeLessThan(0.4);
  });

  it("ISOTONIC overfits a sparse bucket — it reports 100% from two coin flips", () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *  THIS TEST ASSERTS A FAILURE, AND THAT IS THE POINT.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Isotonic regression is the most flexible calibrator and it will win
     * in-sample essentially every time. Handed a bucket containing two setups that
     * happened to win, it reports that scores in that bucket win 100% of the time.
     * It is not confused — it is doing exactly what it was asked.
     *
     * If someone later switches the default to isotonic because it scored
     * beautifully on the data it was fitted on, THIS TEST is the thing that says
     * why that was a mistake. A comment would not have survived the deadline.
     */
    const sparse: Prediction[] = [
      { score: 90, outcome: 1, predicted: 0 },
      { score: 91, outcome: 1, predicted: 0 },
      ...Array.from({ length: 100 }, (_, i) => ({
        score: 50 + (i % 5),
        outcome: (i % 5 === 0 ? 1 : 0) as 0 | 1,
        predicted: 0,
      })),
    ];

    const isotonic = fitIsotonic(sparse, 5);
    const shrinkage = fitShrinkage(sparse, 5, 20);

    expect(isotonic.apply(90)).toBe(1);
    expect(shrinkage.apply(90)).toBeLessThan(0.4);
  });

  it("PLATT borrows strength across buckets and survives sparsity", () => {
    const rows = honestCorpus();
    const platt = fitPlatt(rows);

    /* Monotone, bounded, and never certain. */
    expect(platt.apply(90)).toBeGreaterThan(platt.apply(50));
    expect(platt.apply(100)).toBeLessThan(1);
    expect(platt.apply(0)).toBeGreaterThan(0);
  });

  it("PLATT never emits 0 or 1, even on a perfectly separable corpus", () => {
    /*
     * Without ridge regularisation, perfect separation drives the coefficient to
     * infinity and the model starts claiming certainty. A model that says
     * "certain" has stopped being a probability, and claiming certainty is the one
     * thing this platform may never do.
     */
    const separable: Prediction[] = Array.from({ length: 200 }, (_, i) => ({
      score: i < 100 ? 20 + (i % 10) : 80 + (i % 10),
      outcome: (i < 100 ? 0 : 1) as 0 | 1,
      predicted: 0,
    }));

    const platt = fitPlatt(separable);

    expect(platt.apply(85)).toBeLessThan(1);
    expect(platt.apply(85)).toBeGreaterThan(0);
    expect(platt.apply(20)).toBeGreaterThan(0);
  });

  it("all three are DETERMINISTIC — the same corpus fits the same model twice", () => {
    const rows = honestCorpus();

    expect(fitShrinkage(rows, 5, 20).apply(72)).toBe(fitShrinkage(rows, 5, 20).apply(72));
    expect(fitPlatt(rows).apply(72)).toBe(fitPlatt(rows).apply(72));
    expect(fitIsotonic(rows, 5).apply(72)).toBe(fitIsotonic(rows, 5).apply(72));
  });

  it("a calibrator fitted on a REAL relationship beats predicting the base rate", () => {
    /*
     * The test that says whether the whole apparatus earned its keep. Given a
     * scorer that genuinely separates winners from losers, calibration must beat
     * the null model — otherwise it is complexity that exists to look sophisticated.
     */
    const rows = honestCorpus();
    const fit = rows.slice(0, 1400);
    const grade = rows.slice(1400);

    const platt = fitPlatt(fit);

    const graded: Prediction[] = grade.map((r) => ({
      ...r,
      predicted: platt.apply(r.score),
    }));

    const metrics = reliability(graded, 5);
    const nullModel = baselineBrier(grade);

    expect(metrics.brier).toBeLessThan(nullModel);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  RELIABILITY — THE PLATFORM GRADING ITSELF
 * ══════════════════════════════════════════════════════════════════════ */

describe("reliability metrics", () => {
  it("gives a perfectly calibrated model an ECE of zero", () => {
    const perfect: Prediction[] = [
      ...Array.from({ length: 50 }, (_, i) => ({
        score: 90,
        predicted: 0.5,
        outcome: (i < 25 ? 1 : 0) as 0 | 1,
      })),
    ];

    expect(reliability(perfect, 5).ece).toBeCloseTo(0, 5);
  });

  it("punishes CONFIDENT wrongness far harder than honest uncertainty", () => {
    /*
     * The metric that catches the failure this platform exists to avoid: not being
     * wrong, but being SURE and wrong.
     */
    const sure: Prediction[] = [{ score: 95, predicted: 0.99, outcome: 0 }];
    const humble: Prediction[] = [{ score: 50, predicted: 0.5, outcome: 0 }];

    expect(reliability(sure, 5).logLoss).toBeGreaterThan(
      reliability(humble, 5).logLoss * 5,
    );
  });

  it("MCE catches the disaster that ECE's weighting buries", () => {
    /*
     * 990 setups in a bucket that is calibrated perfectly, and 10 in a bucket where
     * the platform claimed 95% and won 10% of the time. The average barely moves.
     * The worst bucket is a catastrophe — and it is the bucket people bet the most
     * money on.
     */
    const rows: Prediction[] = [
      ...Array.from({ length: 990 }, (_, i) => ({
        score: 50,
        predicted: 0.5,
        outcome: (i % 2) as 0 | 1,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        score: 95,
        predicted: 0.95,
        outcome: (i === 0 ? 1 : 0) as 0 | 1,
      })),
    ];

    const metrics = reliability(rows, 5);

    expect(metrics.ece).toBeLessThan(0.02);
    expect(metrics.mce).toBeGreaterThan(0.8);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  SIMILARITY
 * ══════════════════════════════════════════════════════════════════════ */

describe("the similarity engine", () => {
  const engine = new SimilarityEngine();

  const evidence = setup(75, "WIN").evidence;

  it("NEVER matches across a rules-hash boundary — an edited strategy has no record", () => {
    /*
     * ADR-024: editing a strategy WIPES its track record. Enforced here at read
     * time, by arithmetic, rather than trusted to a DELETE somebody has to
     * remember to run.
     */
    const corpus = Array.from({ length: 200 }, () =>
      setup(75, "WIN", { rulesHash: "v2-EDITED" }),
    );

    const result = engine.search(evidence, corpus);

    expect(result.matches).toHaveLength(0);
    expect(result.winRate).toBeNull();
  });

  it("refuses to claim a rate from too few matches", () => {
    const corpus = [setup(75, "WIN"), setup(75, "WIN"), setup(75, "WIN")];

    const result = engine.search(evidence, corpus);

    /* Three wins from three. The rate is NOT 100% — it is unknown. */
    expect(result.winRate).toBeNull();
    expect(result.tier).toMatch(/too few/);
  });

  it("relaxes tier by tier until it has enough evidence", () => {
    /* Nothing in this regime + direction + volatility, but plenty in the regime. */
    const corpus = Array.from({ length: 40 }, (_, i) =>
      setup(70, i < 24 ? "WIN" : "LOSS", { volatilityBucket: "EXTREME" }),
    );

    const result = engine.search(evidence, corpus);

    expect(result.matches).toHaveLength(40);
    expect(result.winRate).toBeCloseTo(0.6, 5);
    expect(result.tier).toBe("same strategy, regime and direction");
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  THE INVARIANTS THAT KEEP THE CALIBRATION VALID
 * ══════════════════════════════════════════════════════════════════════ */

describe("the replay and production must see the same world", () => {
  it("classifies EVERY risk gate as either replayable or live-only", () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *
     * A calibration model maps SCORE → WIN RATE. It is fitted on scores from the
     * replay and applied to scores from production. If a gate exists live but is
     * silently skipped in the replay, the two score distributions drift apart and
     * every published probability becomes quietly wrong — while every other test
     * still passes.
     *
     * So a NEW gate must be deliberately classified. This test fails until someone
     * decides which side it falls on, and that forced decision is the whole point.
     */
    const classified = new Set([
      ...HISTORICALLY_REPLAYABLE.map((v) => v.name),
      ...REQUIRES_LIVE_MARKET.map((v) => v.name),
    ]);

    const unclassified = ALL_VALIDATORS.filter((v) => !classified.has(v.name));

    expect(unclassified.map((v) => v.name)).toEqual([]);
    expect(classified.size).toBe(ALL_VALIDATORS.length);
  });

  it("never runs a microstructure gate in the replay — history has no order book", () => {
    const replayable = new Set(HISTORICALLY_REPLAYABLE.map((v) => v.name));

    expect(replayable.has("spread")).toBe(false);
    expect(replayable.has("liquidity")).toBe(false);
    expect(replayable.has("exchange")).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  THE POLICY
 * ══════════════════════════════════════════════════════════════════════ */

describe("the confidence policy", () => {
  it("boots", () => {
    expect(() => assertConfidencePolicyCoherent(DEFAULT_CONFIDENCE_POLICY)).not.toThrow();
  });

  it("REFUSES a confluence weight above zero — the uplift is not measured yet", () => {
    /*
     * The exact lie ADR-024 was written to kill: `+4 points per agreeing strategy`,
     * invented from nothing. Until the ledger prices agreement, agreement is worth
     * zero — and the policy will not boot if somebody quietly changes that.
     */
    expect(() =>
      assertConfidencePolicyCoherent({
        ...DEFAULT_CONFIDENCE_POLICY,
        weights: { ...DEFAULT_CONFIDENCE_POLICY.weights, confluence: 4 },
      }),
    ).toThrow(/not a confluence we get to charge for/);
  });

  it("REFUSES a Prime floor beneath the publication floor", () => {
    expect(() =>
      assertConfidencePolicyCoherent({
        ...DEFAULT_CONFIDENCE_POLICY,
        publishAt: 95,
        primeAt: 90,
      }),
    ).toThrow(/subset of published/);
  });

  it("REFUSES a zero prior — three lucky setups would become a 100% win rate", () => {
    expect(() =>
      assertConfidencePolicyCoherent({
        ...DEFAULT_CONFIDENCE_POLICY,
        priorStrength: 0,
      }),
    ).toThrow(/100% win rate/);
  });

  it("REFUSES a split that leaves nothing to grade the model on", () => {
    expect(() =>
      assertConfidencePolicyCoherent({
        ...DEFAULT_CONFIDENCE_POLICY,
        calibrationSplit: 1,
      }),
    ).toThrow(/cannot be graded/);
  });
});
