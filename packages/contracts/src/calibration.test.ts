import { describe, expect, it } from "vitest";
import {
  calibrationModelSchema,
  confidenceReportSchema,
  labelledSetupSchema,
  replayOutcomeSchema,
} from "./calibration";
import { calibratedConfidenceSchema } from "./confidence";

/**
 * The contract's job here is to make the LIE unconstructable.
 *
 * Every test below is a specific way a signal platform flatters itself, and the
 * assertion is that the type system refuses to hold it.
 */

const confidence = {
  score: 91,
  contributors: [],
  basis: "UNCALIBRATED" as const,
  historicalWinRate: null,
  historicalSamples: 0,
  liveWinRate: null,
  liveSamples: 0,
  displayedWinRate: null,
};

const report = {
  candidateId: "c1",
  strategyId: "breakout",
  confidence,
  bucket: "VERY_HIGH" as const,
  publishable: true,
  primeEligible: false,
  verdict: "score 91 clears the publication floor of 85",
  calibrationVersion: 0,
  calibrationMethod: null,
  similarSetups: 0,
  similarWinRate: null,
  supporting: [],
  contradicting: [],
  unassessed: ["no calibration model exists yet"],
  at: new Date().toISOString(),
};

describe("the confidence report refuses to lie", () => {
  it("accepts an honest uncalibrated report — a score with no probability", () => {
    expect(confidenceReportSchema.parse(report).confidence.displayedWinRate).toBeNull();
  });

  it("REFUSES a win rate with no calibration behind it", () => {
    /*
     * The exact lie ADR-024 was written to kill: a number that looks like a
     * probability, backed by nothing. There is nowhere in this shape to put it.
     */
    const parsed = calibratedConfidenceSchema.safeParse({
      ...confidence,
      displayedWinRate: 91,
    });

    expect(parsed.success).toBe(false);
  });

  it("REFUSES a historical win rate with zero historical samples", () => {
    const parsed = calibratedConfidenceSchema.safeParse({
      ...confidence,
      basis: "HISTORICAL",
      historicalWinRate: 61,
      historicalSamples: 0,
      displayedWinRate: 61,
    });

    expect(parsed.success).toBe(false);
  });

  it("REFUSES a live win rate with zero live samples", () => {
    /*
     * The most tempting lie of all, and the one a platform tells itself on the
     * day it launches: dressing the historical replay up as live results,
     * because "live" sounds so much more convincing than "backtested".
     */
    const parsed = calibratedConfidenceSchema.safeParse({
      ...confidence,
      basis: "LIVE",
      liveWinRate: 87,
      liveSamples: 0,
      displayedWinRate: 87,
    });

    expect(parsed.success).toBe(false);
  });

  it("REFUSES a calibration method with no model behind it", () => {
    const parsed = confidenceReportSchema.safeParse({
      ...report,
      calibrationVersion: 0,
      calibrationMethod: "ISOTONIC",
    });

    expect(parsed.success).toBe(false);
  });

  it("REFUSES a Prime signal that is not fit to publish", () => {
    /*
     * Prime is a SUBSET of published, never an exception to it. A platform that
     * can promote an unpublishable signal to its most prominent slot has a
     * threshold system that means nothing.
     */
    const parsed = confidenceReportSchema.safeParse({
      ...report,
      publishable: false,
      primeEligible: true,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("the replay's outcomes", () => {
  it("has exactly three, and EXPIRED is one of them", () => {
    /*
     * A replayed setup has no human managing it, so it cannot produce a
     * BREAKEVEN — nobody moved the stop. It resolved, or it didn't.
     *
     * EXPIRED must exist as its own outcome, because the alternative is to drop
     * unresolved setups from the corpus entirely — which keeps every trade that
     * worked and discards the ones that went nowhere. That is not a rounding
     * error; it is the oldest way to manufacture a win rate.
     */
    expect(replayOutcomeSchema.options).toEqual(["WIN", "LOSS", "EXPIRED"]);
    expect(replayOutcomeSchema.options).not.toContain("BREAKEVEN");
  });

  it("carries the split, so an in-sample number can never be passed off as out-of-sample", () => {
    const setup = labelledSetupSchema.parse({
      evidence: {
        strategyId: "breakout",
        rulesHash: "abc123",
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
        score: 71,
      },
      barTime: 1_700_000_000_000,
      entryPrice: 60_000,
      stopPrice: 59_000,
      targetPrice: 63_000,
      outcome: "WIN",
      realisedR: 3,
      barsHeld: 14,
      split: "VALIDATION",
    });

    expect(setup.split).toBe("VALIDATION");
  });
});

describe("the model is a record, not a promise", () => {
  const metrics = {
    brier: 0.21,
    logLoss: 0.62,
    ece: 0.04,
    mce: 0.11,
    samples: 400,
    baseRate: 0.41,
    curve: [],
  };

  it("carries BOTH the in-sample and the out-of-sample score", () => {
    /*
     * A model that reported only its in-sample fit would be marking its own
     * homework, and it would always get an A. The out-of-sample number is the
     * only one that can embarrass it, which is precisely why it is mandatory.
     */
    const model = calibrationModelSchema.parse({
      version: 1,
      method: "SHRINKAGE",
      fittedAt: new Date().toISOString(),
      corpus: {
        symbols: ["BTC"],
        timeframes: ["1h"],
        from: 1,
        to: 2,
        splitAt: 1,
        setups: 500,
        calibrationSetups: 350,
        validationSetups: 150,
        wins: 200,
        losses: 250,
        expired: 50,
      },
      bins: [],
      plattA: null,
      plattB: null,
      inSample: metrics,
      outOfSample: { ...metrics, ece: 0.09, samples: 150 },
    });

    expect(model.outOfSample.ece).toBeGreaterThan(model.inSample.ece);
    expect(model.corpus.wins + model.corpus.losses + model.corpus.expired).toBe(
      model.corpus.setups,
    );
  });
});
