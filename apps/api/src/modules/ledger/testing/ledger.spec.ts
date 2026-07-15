import { describe, expect, it } from "vitest";
import type { Candle, LedgerEntry } from "@aegis/contracts";
import { calculateOutcome, type SettlementInput } from "../application/settlement/outcome.calculator";
import { StatisticsEngine } from "../application/statistics/statistics.engine";

/* ── Fixtures ──────────────────────────────────────────────────────── */

const HOUR = 3_600_000;

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 100, takerBuyVolume: null };
}

/** A LONG: entry 100, stop 98 (risk 2), target 106 (+3R). */
function base(future: Candle[]): SettlementInput {
  return {
    direction: "LONG",
    entryPrice: 100,
    stopLoss: 98,
    takeProfits: [106],
    publishedAt: 0,
    future,
    maxBarsToTrigger: 8,
    maxBarsToResolve: 72,
    barMs: HOUR,
  };
}

/* ══════════════════════════════════════════════════════════════════════
 *  SETTLEMENT — the market decides, deterministically
 * ══════════════════════════════════════════════════════════════════════ */

describe("the outcome calculator", () => {
  it("settles a WINNER when the target is hit before the stop", () => {
    const r = calculateOutcome(
      base([
        candle(HOUR, 100, 100.5, 99.6, 100.2), // triggers (range contains 100)
        candle(2 * HOUR, 100.2, 106.5, 100, 106), // hits target
      ]),
    );
    expect(r.outcome).toBe("WINNER");
    expect(r.exitReason).toBe("TARGET_1");
    expect(r.realisedR).toBeCloseTo(3, 5);
  });

  it("settles a LOSER when the stop is hit before the target", () => {
    const r = calculateOutcome(
      base([
        candle(HOUR, 100, 100.5, 99.6, 100),
        candle(2 * HOUR, 100, 100.5, 97.5, 98), // hits stop
      ]),
    );
    expect(r.outcome).toBe("LOSER");
    expect(r.exitReason).toBe("STOP_LOSS");
    expect(r.realisedR).toBe(-1);
    /* A stop hit is at least 1R adverse. */
    expect(r.maeR).toBeGreaterThanOrEqual(1);
  });

  it("takes the STOP when one bar touches BOTH — the ambiguous bar (matches the labeller)", () => {
    const r = calculateOutcome(
      base([
        candle(HOUR, 100, 100.5, 99.6, 100),
        candle(2 * HOUR, 100, 107, 97, 101), // range covers both target and stop
      ]),
    );
    /* We cannot know the order, so we take the loss — never resolve ambiguity in
     * our own favour. */
    expect(r.outcome).toBe("LOSER");
  });

  it("CANCELS a signal price never reached — the trade never happened", () => {
    const r = calculateOutcome(
      base([
        candle(HOUR, 101, 102, 100.5, 101.5), // never trades down to 100
        candle(2 * HOUR, 101.5, 103, 101, 102),
      ]),
    );
    expect(r.outcome).toBe("CANCELLED");
    expect(r.exitReason).toBe("NEVER_TRIGGERED");
    expect(r.triggeredAt).toBeNull();
  });

  it("EXPIRES a triggered trade that resolves neither way in the horizon", () => {
    const future = [candle(HOUR, 100, 100.5, 99.6, 100)];
    for (let i = 2; i < 80; i += 1) future.push(candle(i * HOUR, 100, 100.8, 99.4, 100.1));
    const r = calculateOutcome({ ...base(future), maxBarsToResolve: 72 });
    expect(r.outcome).toBe("EXPIRED");
    expect(r.exitReason).toBe("EXPIRY");
  });

  it("records MFE — how far a winner ran in favour before it closed", () => {
    const r = calculateOutcome(
      base([
        candle(HOUR, 100, 100.5, 99.6, 100),
        candle(2 * HOUR, 100, 106.5, 100, 106), // reaches 106.5 = 3.25R at the high
      ]),
    );
    expect(r.mfeR).toBeGreaterThanOrEqual(3);
  });

  it("is DETERMINISTIC — the same path always settles the same way", () => {
    const path = base([
      candle(HOUR, 100, 100.5, 99.6, 100),
      candle(2 * HOUR, 100, 106.5, 100, 106),
    ]);
    expect(JSON.stringify(calculateOutcome(path))).toBe(JSON.stringify(calculateOutcome(path)));
  });

  it("refuses to settle a zero-risk trade", () => {
    expect(() => calculateOutcome({ ...base([]), stopLoss: 100 })).toThrow(/no risk/);
  });

  it("mirrors for a SHORT", () => {
    const r = calculateOutcome({
      direction: "SHORT",
      entryPrice: 100,
      stopLoss: 102,
      takeProfits: [94],
      publishedAt: 0,
      future: [
        candle(HOUR, 100, 100.4, 99.5, 100),
        candle(2 * HOUR, 100, 100.5, 93.5, 94),
      ],
      maxBarsToTrigger: 8,
      maxBarsToResolve: 72,
      barMs: HOUR,
    });
    expect(r.outcome).toBe("WINNER");
    expect(r.realisedR).toBeCloseTo(3, 5);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  STATISTICS — arithmetic on what happened
 * ══════════════════════════════════════════════════════════════════════ */

describe("the statistics engine", () => {
  const engine = new StatisticsEngine();

  function settled(strategyId: string, rs: number[]): LedgerEntry[] {
    return rs.map((r, i) => ({
      signalId: `sig:${strategyId}:${i}`,
      strategyId,
      strategyVersion: 1,
      rulesHash: "h",
      symbol: "BTC",
      exchange: "BINANCE" as const,
      market: "PERPETUAL" as const,
      timeframe: "1h" as const,
      direction: "LONG" as const,
      regime: "TRENDING_BULL" as const,
      entryPrice: 100,
      stopLoss: 98,
      takeProfits: [106],
      confidence: {
        score: 85,
        contributors: [],
        basis: "HISTORICAL" as const,
        historicalWinRate: 55,
        historicalSamples: 100,
        liveWinRate: null,
        liveSamples: 0,
        displayedWinRate: 55,
      },
      confluence: { score: 70, contributors: [], agreeingStrategies: [strategyId], uplift: 0 },
      signalScore: { total: 78, confidence: 85, confluence: 70, riskQuality: 80, freshness: 90 },
      calibrationVersion: 1,
      publishedAt: i * HOUR,
      barTime: i * HOUR,
      settlement: {
        outcome: r > 0 ? ("WINNER" as const) : ("LOSER" as const),
        exitReason: r > 0 ? ("TARGET_1" as const) : ("STOP_LOSS" as const),
        realisedR: r,
        pnlPercent: r,
        exitPrice: r > 0 ? 106 : 98,
        mfeR: Math.max(0, r),
        maeR: r < 0 ? 1 : 0,
        barsHeld: 10,
        triggeredAt: i * HOUR,
        settledAt: (i + 10) * HOUR,
      },
    }));
  }

  it("computes win rate, expectancy and profit factor", () => {
    /* 3 wins at +3R, 2 losses at −1R: win rate 60%, expectancy (9−2)/5 = 1.4R. */
    const entries = settled("breakout", [3, 3, 3, -1, -1]);
    const record = engine.trackRecord(entries, { total: 5, settled: 5, open: 0 });

    expect(record.winRate).toBeCloseTo(0.6, 5);
    expect(record.expectancy).toBeCloseTo(1.4, 5);
    expect(record.profitFactor).toBeCloseTo(4.5, 5); // 9 / 2
    expect(record.totalR).toBeCloseTo(7, 5);
  });

  it("tracks the longest win and loss streaks", () => {
    const entries = settled("breakout", [3, 3, 3, -1, -1, 3]);
    const record = engine.trackRecord(entries, { total: 6, settled: 6, open: 0 });
    expect(record.longestWinStreak).toBe(3);
    expect(record.longestLossStreak).toBe(2);
  });

  it("builds an equity curve that ends at total R", () => {
    const entries = settled("breakout", [3, -1, 3]);
    const record = engine.trackRecord(entries, { total: 3, settled: 3, open: 0 });
    expect(record.curves.equityR.at(-1)?.value).toBeCloseTo(5, 5);
  });

  it("states its basis — a small sample is PROVISIONAL, not a record", () => {
    const small = engine.trackRecord(settled("breakout", [3, 3, 3]), { total: 3, settled: 3, open: 0 });
    expect(small.basis).toBe("PROVISIONAL");

    const none = engine.trackRecord([], { total: 0, settled: 0, open: 0 });
    expect(none.basis).toBe("NO_DATA");

    const many = engine.trackRecord(
      settled("breakout", Array.from({ length: 35 }, (_, i) => (i % 2 ? 3 : -1))),
      { total: 35, settled: 35, open: 0 },
    );
    expect(many.basis).toBe("ESTABLISHED");
  });

  it("reports drawdown of the R equity curve", () => {
    /* +3, then −1, −1, −1 → peak 3, trough 0 → drawdown 3R. */
    const record = engine.trackRecord(settled("breakout", [3, -1, -1, -1]), {
      total: 4,
      settled: 4,
      open: 0,
    });
    expect(record.byStrategy[0].maxDrawdownR).toBeCloseTo(3, 5);
  });
});
