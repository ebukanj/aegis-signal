import { describe, expect, it } from "vitest";
import {
  confluenceReportSchema,
  publishedSignalSchema,
  publicationDecisionSchema,
} from "./signal-engine";

const confidence = {
  score: 82,
  contributors: [],
  basis: "HISTORICAL" as const,
  historicalWinRate: 58,
  historicalSamples: 120,
  liveWinRate: null,
  liveSamples: 0,
  displayedWinRate: 58,
};

const confluence = {
  score: 74,
  contributors: [],
  agreeingStrategies: ["breakout"],
  uplift: 0,
};

const signal = {
  id: "sig:BTC:1h:LONG:1700000000000",
  symbol: "BTC",
  exchange: "BINANCE" as const,
  timeframe: "1h" as const,
  direction: "LONG" as const,
  strategies: ["breakout"],
  rulesHashes: ["abc123"],
  regime: "TRENDING_BULL" as const,
  marketType: "PERPETUAL" as const,
  suggestedLeverage: 5,
  entryPrice: 60_000,
  stopLoss: 59_000,
  takeProfits: [62_000, 63_000],
  confidence,
  confluence,
  signalScore: { total: 78, confidence: 82, confluence: 74, riskQuality: 80, freshness: 95 },
  isPrime: false,
  status: "ACTIVE" as const,
  barTime: 1_700_000_000_000,
  publishedAt: 1_700_000_100_000,
  expiresAt: 1_700_003_600_000,
  summary: "Breakout long on BTC",
  whyPublished: "score 82 clears the publication floor",
  supporting: [],
  contradicting: [],
  unassessed: [],
  calibrationVersion: 1,
};

describe("the published signal refuses impossible trades", () => {
  it("accepts a coherent perpetual long", () => {
    expect(publishedSignalSchema.parse(signal).id).toContain("BTC");
  });

  it("REFUSES a spot short — spot cannot be shorted", () => {
    const parsed = publishedSignalSchema.safeParse({
      ...signal,
      direction: "SHORT",
      marketType: "SPOT",
      suggestedLeverage: null,
      stopLoss: 61_000,
      takeProfits: [58_000],
    });
    expect(parsed.success).toBe(false);
  });

  it("REFUSES spot with leverage", () => {
    const parsed = publishedSignalSchema.safeParse({
      ...signal,
      marketType: "SPOT",
      suggestedLeverage: 3,
    });
    expect(parsed.success).toBe(false);
  });

  it("REFUSES a stop on the wrong side of entry", () => {
    const parsed = publishedSignalSchema.safeParse({ ...signal, stopLoss: 61_000 });
    expect(parsed.success).toBe(false);
  });

  it("REFUSES a target on the losing side", () => {
    const parsed = publishedSignalSchema.safeParse({
      ...signal,
      takeProfits: [62_000, 58_000],
    });
    expect(parsed.success).toBe(false);
  });

  it("REFUSES more crediting strategies than rules that fired", () => {
    /*
     * Every strategy that gets credit must carry the exact rules it fired on — a
     * settled confluence trade has to trace each contributor back to a versioned
     * document, or the track record credits rules that never ran.
     */
    const parsed = publishedSignalSchema.safeParse({
      ...signal,
      strategies: ["breakout", "trend-pullback"],
      rulesHashes: ["abc123"],
    });
    expect(parsed.success).toBe(false);
  });

  it("REFUSES a signal that expires before it is published", () => {
    const parsed = publishedSignalSchema.safeParse({
      ...signal,
      expiresAt: signal.publishedAt - 1,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("confluence is agreement, not confidence", () => {
  it("carries a zero uplift until the ledger prices it (ADR-024 §6)", () => {
    const parsed = confluenceReportSchema.parse(confluence);
    /*
     * The confluence report exists, it measures agreement, and it charges NOTHING
     * for it — the old '+4 per agreeing strategy' was invented, and until the
     * ledger measures what agreement is worth, it is worth zero.
     */
    expect(parsed.uplift).toBe(0);
    expect(parsed.agreeingStrategies.length).toBeGreaterThanOrEqual(1);
  });

  it("always has at least one agreeing strategy — the lone strategy is the degenerate case", () => {
    const parsed = confluenceReportSchema.safeParse({
      ...confluence,
      agreeingStrategies: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("the publication decision explains itself either way", () => {
  it("a suppression names the gate and a reason", () => {
    const parsed = publicationDecisionSchema.safeParse({
      published: false,
      gate: "DUPLICATE",
      reason: "an identical BTC long already fired this bar",
    });
    expect(parsed.success).toBe(true);
  });

  it("a publication states whether it is Prime", () => {
    const parsed = publicationDecisionSchema.parse({
      published: true,
      isPrime: false,
      reason: "published to the scanner; not Prime (no live record yet)",
    });
    expect(parsed.published).toBe(true);
  });
});
