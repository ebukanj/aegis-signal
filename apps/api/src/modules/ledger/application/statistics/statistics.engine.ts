import { Injectable } from "@nestjs/common";
import type {
  LedgerEntry,
  PerformanceCurves,
  StrategyStatistics,
  TrackRecord,
} from "@aegis/contracts";

/**
 * The platform's record, computed from settled outcomes only.
 *
 * ── Everything here is arithmetic on what HAPPENED — nothing is forecast ──
 *
 * Not one number in a track record is a prediction. It is a count, a mean, a ratio
 * over trades that have already closed. The engine's only job is to compute them
 * honestly, and the one dishonest move available — letting a tiny sample pose as a
 * record — is refused by the `basis` field, which says out loud whether there is
 * enough history to believe any of it.
 */
@Injectable()
export class StatisticsEngine {
  /** Below this many settled trades, a track record is PROVISIONAL, not a record. */
  private static readonly ESTABLISHED_AT = 30;

  /* ── Per-strategy ──────────────────────────────────────────────── */

  strategyStatistics(strategyId: string, rulesHash: string, settled: readonly LedgerEntry[]): StrategyStatistics {
    const mine = settled.filter(
      (e) => e.strategyId === strategyId && e.rulesHash === rulesHash && e.settlement,
    );

    return { strategyId, rulesHash, ...aggregate(mine) };
  }

  /* ── The whole platform ────────────────────────────────────────── */

  trackRecord(
    all: readonly LedgerEntry[],
    counts: { total: number; settled: number; open: number },
  ): TrackRecord {
    const settled = all.filter((e) => e.settlement);
    const chron = [...settled].sort(
      (a, b) => (a.settlement!.settledAt ?? 0) - (b.settlement!.settledAt ?? 0),
    );

    const agg = aggregate(chron);

    /* Streaks — walked in settlement order. A breakeven breaks a streak without
     * counting for either side; it is neither a win nor a loss. */
    let current = 0;
    let longestWin = 0;
    let longestLoss = 0;
    for (const e of chron) {
      const r = e.settlement!.realisedR;
      if (r > 0.05) {
        current = current > 0 ? current + 1 : 1;
        longestWin = Math.max(longestWin, current);
      } else if (r < -0.05) {
        current = current < 0 ? current - 1 : -1;
        longestLoss = Math.max(longestLoss, -current);
      } else {
        current = 0;
      }
    }

    const winners = chron.filter((e) => e.settlement!.realisedR > 0.05);
    const losers = chron.filter((e) => e.settlement!.realisedR < -0.05);

    const strategies = new Map<string, LedgerEntry[]>();
    for (const e of chron) {
      const key = `${e.strategyId}::${e.rulesHash}`;
      (strategies.get(key) ?? strategies.set(key, []).get(key)!).push(e);
    }

    return {
      totalSignals: counts.total,
      settled: counts.settled,
      open: counts.open,

      winRate: agg.winRate,
      averageReturnR: agg.averageReturnR,
      expectancy: agg.expectancy,
      profitFactor: agg.profitFactor,
      totalR: round2(chron.reduce((s, e) => s + e.settlement!.realisedR, 0)),

      largestWinnerR: winners.length ? round2(Math.max(...winners.map((e) => e.settlement!.realisedR))) : null,
      largestLoserR: losers.length ? round2(Math.min(...losers.map((e) => e.settlement!.realisedR))) : null,

      currentStreak: current,
      longestWinStreak: longestWin,
      longestLossStreak: longestLoss,

      averageConfidenceWinners: meanConfidence(winners),
      averageConfidenceLosers: meanConfidence(losers),

      byStrategy: [...strategies.entries()].map(([key, entries]) => {
        const [strategyId, rulesHash] = key.split("::");
        return { strategyId, rulesHash, ...aggregate(entries) };
      }),

      curves: curves(chron),

      basis:
        counts.settled === 0
          ? "NO_DATA"
          : counts.settled >= StatisticsEngine.ESTABLISHED_AT
            ? "ESTABLISHED"
            : "PROVISIONAL",
    };
  }
}

/* ── The shared aggregation ────────────────────────────────────────── */

function aggregate(entries: readonly LedgerEntry[]): Omit<StrategyStatistics, "strategyId" | "rulesHash"> {
  const settled = entries.filter((e) => e.settlement);
  const n = settled.length;

  const winners = settled.filter((e) => e.settlement!.realisedR > 0.05).length;
  const losers = settled.filter((e) => e.settlement!.realisedR < -0.05).length;
  const breakeven = settled.filter((e) => Math.abs(e.settlement!.realisedR) <= 0.05).length;
  const expired = settled.filter((e) => e.settlement!.outcome === "EXPIRED").length;

  const rs = settled.map((e) => e.settlement!.realisedR);
  const grossWin = rs.filter((r) => r > 0).reduce((s, r) => s + r, 0);
  const grossLoss = rs.filter((r) => r < 0).reduce((s, r) => s + Math.abs(r), 0);

  /* Drawdown of the R equity curve. */
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const e of [...settled].sort((a, b) => (a.settlement!.settledAt ?? 0) - (b.settlement!.settledAt ?? 0))) {
    equity += e.settlement!.realisedR;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  const totalR = rs.reduce((s, r) => s + r, 0);

  return {
    sampleSize: n,
    winners,
    losers,
    breakeven,
    expired,
    winRate: n > 0 ? round4(winners / n) : null,
    expectancy: n > 0 ? round2(totalR / n) : null,
    profitFactor: grossLoss > 0 ? round2(grossWin / grossLoss) : null,
    averageReturnR: n > 0 ? round2(totalR / n) : null,
    averageHoldingBars: n > 0 ? round2(settled.reduce((s, e) => s + e.settlement!.barsHeld, 0) / n) : null,
    averageConfidence: n > 0 ? round2(settled.reduce((s, e) => s + e.confidence.score, 0) / n) : null,
    maxDrawdownR: n > 0 ? round2(drawdown) : null,
    recoveryFactor: drawdown > 0 ? round2(totalR / drawdown) : null,
  };
}

function curves(chron: readonly LedgerEntry[]): PerformanceCurves {
  const equityR: PerformanceCurves["equityR"] = [];
  const winRate: PerformanceCurves["winRate"] = [];
  const expectancy: PerformanceCurves["expectancy"] = [];
  const drawdownR: PerformanceCurves["drawdownR"] = [];

  let equity = 0;
  let peak = 0;
  let wins = 0;

  chron.forEach((e, i) => {
    const at = e.settlement!.settledAt;
    const r = e.settlement!.realisedR;

    equity += r;
    peak = Math.max(peak, equity);
    if (r > 0.05) wins += 1;

    equityR.push({ at, value: round2(equity) });
    winRate.push({ at, value: round4(wins / (i + 1)) });
    expectancy.push({ at, value: round2(equity / (i + 1)) });
    drawdownR.push({ at, value: round2(-(peak - equity)) });
  });

  return { equityR, winRate, expectancy, drawdownR };
}

function meanConfidence(entries: readonly LedgerEntry[]): number | null {
  if (entries.length === 0) return null;
  return round2(entries.reduce((s, e) => s + e.confidence.score, 0) / entries.length);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
