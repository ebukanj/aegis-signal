import { describe, expect, it } from "vitest";
import { ledgerEntrySchema, settlementSchema, trackRecordSchema } from "./ledger";

const confidence = {
  score: 88,
  contributors: [],
  basis: "HISTORICAL" as const,
  historicalWinRate: 58,
  historicalSamples: 120,
  liveWinRate: null,
  liveSamples: 0,
  displayedWinRate: 58,
};

const confluence = { score: 74, contributors: [], agreeingStrategies: ["breakout"], uplift: 0 };
const signalScore = { total: 78, confidence: 88, confluence: 74, riskQuality: 80, freshness: 95 };

const entry = {
  signalId: "sig:BTC:1h:LONG:1700000000000:abc",
  strategyId: "breakout",
  strategyVersion: 1,
  rulesHash: "hash",
  symbol: "BTC",
  exchange: "BINANCE" as const,
  market: "PERPETUAL" as const,
  timeframe: "1h" as const,
  direction: "LONG" as const,
  regime: "TRENDING_BULL" as const,
  entryPrice: 60_000,
  stopLoss: 59_000,
  takeProfits: [63_000],
  confidence,
  confluence,
  signalScore,
  calibrationVersion: 1,
  publishedAt: 1_700_000_100_000,
  barTime: 1_700_000_000_000,
  settlement: null,
};

describe("the ledger entry is a permanent snapshot", () => {
  it("accepts an open entry with no settlement", () => {
    expect(ledgerEntrySchema.parse(entry).settlement).toBeNull();
  });

  it("accepts a settled entry carrying its full arithmetic", () => {
    const settled = ledgerEntrySchema.parse({
      ...entry,
      settlement: {
        outcome: "WINNER",
        exitReason: "TARGET_1",
        realisedR: 3,
        pnlPercent: 5,
        exitPrice: 63_000,
        mfeR: 3.2,
        maeR: 0.4,
        barsHeld: 14,
        triggeredAt: 1_700_000_200_000,
        settledAt: 1_700_050_000_000,
      },
    });
    expect(settled.settlement?.outcome).toBe("WINNER");
  });
});

describe("settlement refuses incoherent history", () => {
  it("REFUSES a cancelled signal that somehow has a trigger time", () => {
    /* Cancelled means price never reached entry — it never became a trade, so it
     * cannot carry the moment it was entered. */
    const parsed = settlementSchema.safeParse({
      outcome: "CANCELLED",
      exitReason: "NEVER_TRIGGERED",
      realisedR: 0,
      pnlPercent: 0,
      exitPrice: 60_000,
      mfeR: 0,
      maeR: 0,
      barsHeld: 0,
      triggeredAt: 1_700_000_200_000,
      settledAt: 1_700_050_000_000,
    });
    expect(parsed.success).toBe(false);
  });

  it("REFUSES a negative adverse excursion — excursions are magnitudes", () => {
    const parsed = settlementSchema.safeParse({
      outcome: "WINNER",
      exitReason: "TARGET_1",
      realisedR: 3,
      pnlPercent: 5,
      exitPrice: 63_000,
      mfeR: 3.2,
      maeR: -0.4,
      barsHeld: 14,
      triggeredAt: 1_700_000_200_000,
      settledAt: 1_700_050_000_000,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("the track record states its own basis", () => {
  it("carries NO_DATA / PROVISIONAL / ESTABLISHED so a small sample cannot pose as a record", () => {
    const record = trackRecordSchema.parse({
      totalSignals: 3,
      settled: 3,
      open: 0,
      winRate: 1,
      averageReturnR: 3,
      expectancy: 3,
      profitFactor: null,
      totalR: 9,
      largestWinnerR: 3,
      largestLoserR: null,
      currentStreak: 3,
      longestWinStreak: 3,
      longestLossStreak: 0,
      averageConfidenceWinners: 88,
      averageConfidenceLosers: null,
      byStrategy: [],
      curves: { equityR: [], winRate: [], expectancy: [], drawdownR: [] },
      basis: "PROVISIONAL",
    });
    /* 3 wins from 3 is not a 100% platform — the basis says PROVISIONAL out loud. */
    expect(record.basis).toBe("PROVISIONAL");
  });
});
