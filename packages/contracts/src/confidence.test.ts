import { describe, expect, it } from "vitest";
import { calibratedConfidenceSchema } from "./confidence";

/**
 * The platform used to display "91%" from `randInt(52, 92) + extras * 4`.
 *
 * These tests exist so that cannot happen again. The shape must make the
 * dishonest thing unrepresentable — not merely discouraged.
 */

const contributors = [
  {
    name: "Breakout base rate in an uptrend",
    weight: 52,
    source: "LEDGER" as const,
    measured: "52% over 340 setups",
    note: "How this strategy has actually performed in this market.",
  },
  {
    name: "Volume confirmation",
    weight: 6,
    source: "MEASURED" as const,
    measured: "2.3× average (needed 1.5×)",
    note: "Real participation behind the move.",
  },
];

describe("a score cannot pretend to be a probability", () => {
  it("accepts an uncalibrated score with no win rate", () => {
    const result = calibratedConfidenceSchema.safeParse({
      score: 91,
      contributors,
      basis: "UNCALIBRATED",
      historicalWinRate: null,
      historicalSamples: 0,
      liveWinRate: null,
      liveSamples: 0,
      displayedWinRate: null,
    });
    expect(result.success).toBe(true);
  });

  it("REJECTS an uncalibrated score that still shows a win rate", () => {
    // This is the old bug, expressed as data: a number with nothing behind it.
    const result = calibratedConfidenceSchema.safeParse({
      score: 91,
      contributors,
      basis: "UNCALIBRATED",
      historicalWinRate: null,
      historicalSamples: 0,
      liveWinRate: null,
      liveSamples: 0,
      displayedWinRate: 91,
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS a calibrated basis with no win rate to show", () => {
    const result = calibratedConfidenceSchema.safeParse({
      score: 91,
      contributors,
      basis: "LIVE",
      historicalWinRate: null,
      historicalSamples: 0,
      liveWinRate: 87,
      liveSamples: 34,
      displayedWinRate: null,
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS a historical rate with zero historical samples", () => {
    const result = calibratedConfidenceSchema.safeParse({
      score: 91,
      contributors,
      basis: "HISTORICAL",
      historicalWinRate: 61,
      historicalSamples: 0,
      liveWinRate: null,
      liveSamples: 0,
      displayedWinRate: 61,
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS a live rate with zero live signals behind it", () => {
    const result = calibratedConfidenceSchema.safeParse({
      score: 91,
      contributors,
      basis: "LIVE",
      historicalWinRate: 61,
      historicalSamples: 1284,
      liveWinRate: 87,
      liveSamples: 0,
      displayedWinRate: 87,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a day-one historical prior, honestly labelled", () => {
    const result = calibratedConfidenceSchema.safeParse({
      score: 91,
      contributors,
      basis: "HISTORICAL",
      historicalWinRate: 61,
      historicalSamples: 1284,
      liveWinRate: null,
      liveSamples: 0,
      displayedWinRate: 61,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a mature signal running on live results alone", () => {
    const result = calibratedConfidenceSchema.safeParse({
      score: 91,
      contributors,
      basis: "LIVE",
      historicalWinRate: 61,
      historicalSamples: 1284,
      liveWinRate: 87,
      liveSamples: 34,
      displayedWinRate: 87,
    });
    expect(result.success).toBe(true);
    // History is carried, not merged. Both numbers survive, separately.
    expect(result.success && result.data.historicalWinRate).toBe(61);
  });

  it("rejects a contributor with no measured value behind it", () => {
    const result = calibratedConfidenceSchema.safeParse({
      score: 91,
      contributors: [{ name: "Vibes", weight: 20, source: "MEASURED" }],
      basis: "UNCALIBRATED",
      historicalWinRate: null,
      historicalSamples: 0,
      liveWinRate: null,
      liveSamples: 0,
      displayedWinRate: null,
    });
    expect(result.success).toBe(false);
  });
});
