import { STRATEGY_ROSTER } from "@/constants/strategies";
import type { AreaChartPoint } from "@/components/shared/charts/area-chart";
import type { BarChartPoint } from "@/components/shared/charts/bar-chart";
import type { MarketRegime } from "@/types/domain";
import { REGIME_META } from "@/constants/domain";
import {
  mockLedger,
  STARTING_EQUITY,
  REGIME_TIMELINE,
  WINDOW_START,
  STRATEGY_STATUS,
  LEDGER_EXCHANGES,
  dayOffsetToDate,
} from "./mock-ledger";
import {
  DATE_RANGES,
  STRATEGY_RADAR_AXES,
} from "../types";
import type {
  AnalyticsFilters,
  AnalyticsKpi,
  AnalyticsReport,
  ConfidenceBucket,
  ConfidenceBucketKey,
  CorrelationMatrix,
  DistributionBin,
  ExposureSlice,
  HeatmapDay,
  HeatmapMonth,
  KpiKey,
  LeaderboardEntry,
  LeaderboardKey,
  LedgerRecord,
  PerformanceTrend,
  RegimePerformance,
  ReturnSeries,
  RiskAnalytics,
  SignalQuality,
  StrategyPerformanceRow,
  StrategyRadarAxis,
  TradeDistribution,
  DateRangeKey,
} from "../types";

/**
 * MOCK LAYER — the report builder transforms a raw ledger into the complete
 * `AnalyticsReport` that every analytics panel renders. When the backend
 * Analytics module ships, `analytics-api.ts` will call a REST endpoint that
 * returns the same shape, and this file is deleted.
 *
 * Design principle: the UI never does math. Every KPI, chart series, table
 * row, and heatmap cell is precomputed here. Components receive the report
 * and render it.
 */

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const round = (v: number, dp = 2) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

const pct = (num: number, den: number) =>
  den === 0 ? 0 : round((num / den) * 100, 1);

const formatR = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;

const formatPct = (v: number, signed = true) => {
  const s = signed && v > 0 ? "+" : "";
  return `${s}${v.toFixed(1)}%`;
};

const formatHours = (h: number): string => {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};

function windowDaysForRange(range: DateRangeKey): number {
  return DATE_RANGES.find((r) => r.key === range)?.days ?? 90;
}

/** Midnight UTC of the start of the window. */
function windowStartDate(range: DateRangeKey): Date {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - windowDaysForRange(range) + 1);
  return start;
}

function toUnixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

/** Group records by a string key. */
function groupBy<T>(items: T[], fn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = fn(item);
    const group = map.get(key);
    if (group) group.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Filter                                                                      */
/* -------------------------------------------------------------------------- */

function filterLedger(filters: AnalyticsFilters): LedgerRecord[] {
  const rangeStart = windowStartDate(filters.range);

  return mockLedger.filter((r) => {
    if (new Date(r.closedAt) < rangeStart) return false;
    if (filters.strategy !== "ALL" && r.strategy !== filters.strategy) return false;
    if (filters.exchange !== "ALL" && r.exchange !== filters.exchange) return false;
    if (filters.regime !== "ALL" && r.regime !== filters.regime) return false;
    if (filters.direction !== "ALL" && r.direction !== filters.direction) return false;
    if (filters.timeframe !== "ALL" && r.timeframe !== filters.timeframe) return false;
    if (r.confidence < filters.confidenceMin || r.confidence > filters.confidenceMax) return false;
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* KPIs                                                                        */
/* -------------------------------------------------------------------------- */

interface KpiRaw {
  totalSignals: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  lossRate: number;
  profitFactor: number;
  netReturn: number;
  expectancy: number;
  avgRMultiple: number;
  avgHoldingTime: number;
  maxDrawdown: number;
  avgConfidence: number;
  activeStrategies: number;
}

function computeKpiRaw(records: LedgerRecord[]): KpiRaw {
  const triggered = records.filter((r) => r.triggered);
  const wins = triggered.filter((r) => r.outcome === "WIN");
  const losses = triggered.filter((r) => r.outcome === "LOSS");
  const totalTrades = triggered.length;

  const grossWin = wins.reduce((s, r) => s + r.returnR, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r.returnR, 0));
  const netR = triggered.reduce((s, r) => s + r.returnR, 0);

  const avgHolding =
    totalTrades === 0
      ? 0
      : triggered.reduce((s, r) => s + r.holdingHours, 0) / totalTrades;

  // Drawdown from equity curve
  let equity = STARTING_EQUITY;
  let peak = equity;
  let maxDd = 0;
  for (const r of triggered) {
    equity += r.returnPct * (equity / 100);
    if (equity > peak) peak = equity;
    const dd = ((equity - peak) / peak) * 100;
    if (dd < maxDd) maxDd = dd;
  }

  const strategies = new Set(records.map((r) => r.strategy));
  const activeStrategies = [...strategies].filter(
    (s) => STRATEGY_STATUS[s] === "ACTIVE",
  ).length;

  return {
    totalSignals: records.length,
    totalTrades,
    wins: wins.length,
    losses: losses.length,
    winRate: pct(wins.length, totalTrades),
    lossRate: pct(losses.length, totalTrades),
    profitFactor: grossLoss === 0 ? grossWin : round(grossWin / grossLoss, 2),
    netReturn: round(netR, 2),
    expectancy: totalTrades === 0 ? 0 : round(netR / totalTrades, 3),
    avgRMultiple:
      wins.length === 0 ? 0 : round(grossWin / wins.length, 2),
    avgHoldingTime: round(avgHolding, 1),
    maxDrawdown: round(maxDd, 1),
    avgConfidence:
      records.length === 0
        ? 0
        : round(
            records.reduce((s, r) => s + r.confidence, 0) / records.length,
            0,
          ),
    activeStrategies,
  };
}

function buildKpis(
  current: KpiRaw,
  previous: KpiRaw,
): AnalyticsKpi[] {
  type KpiDef = {
    key: KpiKey;
    label: string;
    value: (k: KpiRaw) => string;
    raw: (k: KpiRaw) => number;
    /** True when a rising value is bad (e.g. drawdown, loss rate). */
    invertTone?: boolean;
    hint?: string;
  };

  const defs: KpiDef[] = [
    { key: "totalSignals", label: "Total Signals", value: (k) => k.totalSignals.toLocaleString(), raw: (k) => k.totalSignals },
    { key: "winRate", label: "Win Rate", value: (k) => formatPct(k.winRate, false), raw: (k) => k.winRate },
    { key: "lossRate", label: "Loss Rate", value: (k) => formatPct(k.lossRate, false), raw: (k) => k.lossRate, invertTone: true },
    { key: "profitFactor", label: "Profit Factor", value: (k) => k.profitFactor.toFixed(2), raw: (k) => k.profitFactor },
    { key: "netReturn", label: "Net Return", value: (k) => formatR(k.netReturn), raw: (k) => k.netReturn },
    { key: "expectancy", label: "Expectancy", value: (k) => formatR(k.expectancy), raw: (k) => k.expectancy, hint: "R per trade" },
    { key: "avgRMultiple", label: "Avg R Multiple", value: (k) => `${k.avgRMultiple.toFixed(2)}R`, raw: (k) => k.avgRMultiple, hint: "average winner" },
    { key: "avgHoldingTime", label: "Avg Holding Time", value: (k) => formatHours(k.avgHoldingTime), raw: (k) => k.avgHoldingTime },
    { key: "maxDrawdown", label: "Max Drawdown", value: (k) => formatPct(k.maxDrawdown, false), raw: (k) => k.maxDrawdown, invertTone: true },
    { key: "avgConfidence", label: "Avg Confidence", value: (k) => `${k.avgConfidence}`, raw: (k) => k.avgConfidence },
    { key: "activeStrategies", label: "Active Strategies", value: (k) => `${k.activeStrategies}`, raw: (k) => k.activeStrategies },
    { key: "totalTrades", label: "Total Trades", value: (k) => k.totalTrades.toLocaleString(), raw: (k) => k.totalTrades },
  ];

  return defs.map((d): AnalyticsKpi => {
    const cur = d.raw(current);
    const prev = d.raw(previous);
    const diff = cur - prev;
    const direction: AnalyticsKpi["deltaDirection"] =
      Math.abs(diff) < 0.01 ? "flat" : diff > 0 ? "up" : "down";

    let deltaTone: AnalyticsKpi["deltaTone"] = "neutral";
    if (direction !== "flat") {
      const isGood = d.invertTone ? direction === "down" : direction === "up";
      deltaTone = isGood ? "positive" : "negative";
    }

    return {
      key: d.key,
      label: d.label,
      value: d.value(current),
      delta: direction === "flat" ? undefined : formatPct(diff),
      deltaDirection: direction,
      deltaTone,
      hint: d.hint,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Equity curve & return series                                                */
/* -------------------------------------------------------------------------- */

function buildEquityCurve(records: LedgerRecord[]): AreaChartPoint[] {
  const triggered = records.filter((r) => r.triggered);
  if (triggered.length === 0) return [];

  const byDay = groupBy(triggered, (r) => r.closedAt.slice(0, 10));
  let equity = STARTING_EQUITY;
  const points: AreaChartPoint[] = [];

  const sortedDays = [...byDay.keys()].sort();
  for (const day of sortedDays) {
    const dayRecords = byDay.get(day)!;
    for (const r of dayRecords) {
      equity += r.returnPct * (equity / 100);
    }
    points.push({ time: toUnixSeconds(day), value: round(equity, 2) });
  }
  return points;
}

function buildReturnSeries(records: LedgerRecord[]): ReturnSeries {
  const triggered = records.filter((r) => r.triggered);

  // Daily
  const byDay = groupBy(triggered, (r) => r.closedAt.slice(0, 10));
  const daily: BarChartPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, recs]) => ({
      time: toUnixSeconds(day),
      value: round(recs.reduce((s, r) => s + r.returnPct, 0), 2),
    }));

  // Weekly (ISO week start = Monday)
  const byWeek = groupBy(triggered, (r) => {
    const d = new Date(r.closedAt);
    const weekDay = d.getUTCDay();
    const diff = (weekDay + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - diff);
    return d.toISOString().slice(0, 10);
  });
  const weekly: BarChartPoint[] = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, recs]) => ({
      time: toUnixSeconds(week),
      value: round(recs.reduce((s, r) => s + r.returnPct, 0), 2),
    }));

  // Monthly
  const byMonth = groupBy(triggered, (r) => r.closedAt.slice(0, 7));
  const monthly: BarChartPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, recs]) => ({
      time: toUnixSeconds(`${month}-01`),
      value: round(recs.reduce((s, r) => s + r.returnPct, 0), 2),
    }));

  // Cumulative
  let cum = 0;
  const cumulative: AreaChartPoint[] = daily.map((d) => {
    cum += d.value;
    return { time: d.time, value: round(cum, 2) };
  });

  return { cumulative, daily, weekly, monthly };
}

/* -------------------------------------------------------------------------- */
/* Strategy performance                                                        */
/* -------------------------------------------------------------------------- */

function computeTrend(records: LedgerRecord[]): PerformanceTrend {
  if (records.length < 10) return "STABLE";
  const half = Math.floor(records.length / 2);
  const first = records.slice(0, half).filter((r) => r.triggered);
  const second = records.slice(half).filter((r) => r.triggered);
  const wrFirst = first.length === 0 ? 0 : first.filter((r) => r.outcome === "WIN").length / first.length;
  const wrSecond = second.length === 0 ? 0 : second.filter((r) => r.outcome === "WIN").length / second.length;
  const diff = wrSecond - wrFirst;
  if (diff > 0.04) return "IMPROVING";
  if (diff < -0.04) return "DECLINING";
  return "STABLE";
}

function buildStrategyPerformance(records: LedgerRecord[]): StrategyPerformanceRow[] {
  const byStrategy = groupBy(records, (r) => r.strategy);

  // Collect rows
  const rows: StrategyPerformanceRow[] = [];
  for (const identity of STRATEGY_ROSTER) {
    const stratRecords = byStrategy.get(identity.slug) ?? [];
    if (stratRecords.length === 0) continue;

    const kpi = computeKpiRaw(stratRecords);

    rows.push({
      slug: identity.slug,
      name: identity.name,
      className: identity.className,
      status: (STRATEGY_STATUS[identity.slug] ?? "ACTIVE") as "ACTIVE" | "PROBATION" | "DISABLED",
      winRate: kpi.winRate,
      profitFactor: kpi.profitFactor,
      expectancy: kpi.expectancy,
      avgReturnR: kpi.avgRMultiple,
      avgConfidence: kpi.avgConfidence,
      maxDrawdown: kpi.maxDrawdown,
      totalSignals: kpi.totalSignals,
      netR: kpi.netReturn,
      trend: computeTrend(stratRecords),
      radar: { "Win Rate": 0, "Profit Factor": 0, Expectancy: 0, Consistency: 0, "Risk Control": 0, Activity: 0 },
    });
  }

  // Normalize radar axes 0–100 across strategies
  if (rows.length > 0) {
    const axes: { axis: StrategyRadarAxis; getter: (r: StrategyPerformanceRow) => number; invertBetter?: boolean }[] = [
      { axis: "Win Rate", getter: (r) => r.winRate },
      { axis: "Profit Factor", getter: (r) => r.profitFactor },
      { axis: "Expectancy", getter: (r) => r.expectancy },
      { axis: "Consistency", getter: (r) => (r.trend === "IMPROVING" ? 80 : r.trend === "STABLE" ? 60 : 30) },
      { axis: "Risk Control", getter: (r) => -r.maxDrawdown, invertBetter: false },
      { axis: "Activity", getter: (r) => r.totalSignals },
    ];
    for (const { axis, getter } of axes) {
      const values = rows.map(getter);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min || 1;
      for (const row of rows) {
        row.radar[axis] = round(((getter(row) - min) / range) * 100, 0);
      }
    }
  }

  return rows.sort((a, b) => b.netR - a.netR);
}

/* -------------------------------------------------------------------------- */
/* Signal quality                                                              */
/* -------------------------------------------------------------------------- */

function buildSignalQuality(records: LedgerRecord[]): SignalQuality {
  const triggered = records.filter((r) => r.triggered);
  const expired = records.filter((r) => !r.triggered);
  const falsePositives = triggered.filter(
    (r) => r.outcome === "LOSS" && !r.reachedTp1,
  );

  const confidenceBuckets: { key: ConfidenceBucketKey; label: string; range: string; min: number; max: number }[] = [
    { key: "HIGH", label: "High Confidence", range: "85–100", min: 85, max: 100 },
    { key: "MEDIUM", label: "Medium Confidence", range: "70–84", min: 70, max: 84 },
    { key: "LOW", label: "Low Confidence", range: "55–69", min: 55, max: 69 },
  ];

  const buckets: ConfidenceBucket[] = confidenceBuckets.map((def) => {
    const inBucket = records.filter((r) => r.confidence >= def.min && r.confidence <= def.max);
    const trig = inBucket.filter((r) => r.triggered);
    const wins = trig.filter((r) => r.outcome === "WIN");
    const avgR = trig.length === 0 ? 0 : round(trig.reduce((s, r) => s + r.returnR, 0) / trig.length, 3);
    return {
      key: def.key,
      label: def.label,
      range: def.range,
      signals: inBucket.length,
      triggered: trig.length,
      wins: wins.length,
      successRate: pct(wins.length, trig.length),
      avgR,
      calibrated: false, // set below
    };
  });

  // Calibration check: each bucket should outperform the one below it
  for (let i = 0; i < buckets.length - 1; i++) {
    buckets[i].calibrated = buckets[i].successRate > buckets[i + 1].successRate;
  }
  if (buckets.length > 0) {
    buckets[buckets.length - 1].calibrated = true; // base bucket
  }
  const confidenceIsCalibrated = buckets.every((b) => b.calibrated);

  // Success trend by month
  const byMonth = groupBy(triggered, (r) => r.closedAt.slice(0, 7));
  const successTrend = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, recs]) => ({
      label: month,
      value: pct(recs.filter((r) => r.outcome === "WIN").length, recs.length),
    }));

  // Average hours to target
  const withTarget = triggered.filter((r) => r.hoursToTarget !== null);
  const avgHoursToTarget =
    withTarget.length === 0
      ? 0
      : round(
          withTarget.reduce((s, r) => s + (r.hoursToTarget ?? 0), 0) / withTarget.length,
          1,
        );

  return {
    buckets,
    falsePositives: falsePositives.length,
    falsePositiveRate: pct(falsePositives.length, triggered.length),
    falseNegatives: null,
    expiredSignals: expired.length,
    expiryRate: pct(expired.length, records.length),
    avgHoursToTarget,
    successTrend,
    confidenceIsCalibrated,
  };
}

/* -------------------------------------------------------------------------- */
/* Risk analytics                                                              */
/* -------------------------------------------------------------------------- */

function buildRiskAnalytics(records: LedgerRecord[]): RiskAnalytics {
  const triggered = records.filter((r) => r.triggered);

  // Drawdown curve
  let equity = STARTING_EQUITY;
  let peak = equity;
  let maxDd = 0;
  let currentDd = 0;
  const drawdownCurve: AreaChartPoint[] = [];

  const byDay = groupBy(triggered, (r) => r.closedAt.slice(0, 10));
  const sortedDays = [...byDay.keys()].sort();
  for (const day of sortedDays) {
    const dayRecs = byDay.get(day)!;
    for (const r of dayRecs) {
      equity += r.returnPct * (equity / 100);
    }
    if (equity > peak) peak = equity;
    const dd = ((equity - peak) / peak) * 100;
    if (dd < maxDd) maxDd = dd;
    currentDd = dd;
    drawdownCurve.push({ time: toUnixSeconds(day), value: round(dd, 2) });
  }

  // Risk distribution histogram
  const riskValues = triggered.map((r) => r.riskPercent);
  const riskBins: DistributionBin[] = [
    { label: "0–0.5%", count: 0, tone: "positive" },
    { label: "0.5–1%", count: 0, tone: "neutral" },
    { label: "1–1.5%", count: 0, tone: "warning" as "neutral" },
    { label: "1.5%+", count: 0, tone: "negative" },
  ];
  for (const rv of riskValues) {
    if (rv <= 0.5) riskBins[0].count++;
    else if (rv <= 1) riskBins[1].count++;
    else if (rv <= 1.5) riskBins[2].count++;
    else riskBins[3].count++;
  }

  const avgRisk = riskValues.length === 0 ? 0 : round(riskValues.reduce((s, v) => s + v, 0) / riskValues.length, 2);
  const rValues = triggered.map((r) => r.returnR);
  const largestWinR = rValues.length === 0 ? 0 : round(Math.max(...rValues), 2);
  const largestLossR = rValues.length === 0 ? 0 : round(Math.min(...rValues), 2);

  // Portfolio heat: sum of current open risk (simulated as average * active count)
  const activeStrategies = new Set(
    records.filter((r) => STRATEGY_STATUS[r.strategy] === "ACTIVE").map((r) => r.strategy),
  ).size;
  const portfolioHeat = Math.min(100, round(avgRisk * activeStrategies * 5, 0));

  // Exposure by strategy
  const stratGroups = groupBy(triggered, (r) => r.strategy);
  const totalRisk = triggered.reduce((s, r) => s + r.riskPercent, 0);
  const exposureByStrategy: ExposureSlice[] = [...stratGroups.entries()]
    .map(([slug, recs]) => ({
      label: STRATEGY_ROSTER.find((s) => s.slug === slug)?.name ?? slug,
      share: pct(recs.reduce((s, r) => s + r.riskPercent, 0), totalRisk),
      netR: round(recs.reduce((s, r) => s + r.returnR, 0), 2),
    }))
    .sort((a, b) => b.share - a.share);

  // Exposure by exchange
  const exchGroups = groupBy(triggered, (r) => r.exchange);
  const exposureByExchange: ExposureSlice[] = [...exchGroups.entries()]
    .map(([exch, recs]) => ({
      label: exch,
      share: pct(recs.reduce((s, r) => s + r.riskPercent, 0), totalRisk),
      netR: round(recs.reduce((s, r) => s + r.returnR, 0), 2),
    }))
    .sort((a, b) => b.share - a.share);

  return {
    drawdownCurve,
    maxDrawdown: round(maxDd, 1),
    currentDrawdown: round(currentDd, 1),
    riskDistribution: riskBins,
    avgRisk,
    largestWinR,
    largestLossR,
    portfolioHeat,
    exposureByStrategy,
    exposureByExchange,
  };
}

/* -------------------------------------------------------------------------- */
/* Regime performance                                                          */
/* -------------------------------------------------------------------------- */

function buildRegimePerformance(records: LedgerRecord[]): RegimePerformance[] {
  const regimes: MarketRegime[] = [
    "TRENDING_BULL", "TRENDING_BEAR", "RANGE",
    "TRANSITION", "HIGH_VOLATILITY", "RISK_OFF",
  ];

  return regimes.map((regime) => {
    const recs = records.filter((r) => r.regime === regime);
    const triggered = recs.filter((r) => r.triggered);
    const wins = triggered.filter((r) => r.outcome === "WIN");
    const netR = round(triggered.reduce((s, r) => s + r.returnR, 0), 2);

    // Count days this regime appears in the timeline
    const days = REGIME_TIMELINE.filter((r) => r === regime).length;

    // Best strategy by net R
    const stratGroups = groupBy(triggered, (r) => r.strategy);
    let bestStrategy: string | null = null;
    let bestNetR = -Infinity;
    for (const [slug, stratRecs] of stratGroups) {
      const sNetR = stratRecs.reduce((s, r) => s + r.returnR, 0);
      if (sNetR > bestNetR) {
        bestNetR = sNetR;
        bestStrategy = STRATEGY_ROSTER.find((s) => s.slug === slug)?.name ?? slug;
      }
    }

    return {
      regime,
      signals: recs.length,
      winRate: pct(wins.length, triggered.length),
      expectancy: triggered.length === 0 ? 0 : round(netR / triggered.length, 3),
      netR,
      avgConfidence: recs.length === 0 ? 0 : round(recs.reduce((s, r) => s + r.confidence, 0) / recs.length, 0),
      days,
      bestStrategy,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Heatmap                                                                     */
/* -------------------------------------------------------------------------- */

function buildHeatmap(records: LedgerRecord[]): HeatmapMonth[] {
  const triggered = records.filter((r) => r.triggered);
  const byDay = groupBy(triggered, (r) => r.closedAt.slice(0, 10));

  // Collect all months in the window
  const months = new Map<string, HeatmapMonth>();

  for (const [dateStr, recs] of byDay) {
    const monthKey = dateStr.slice(0, 7);
    if (!months.has(monthKey)) {
      const d = new Date(dateStr);
      const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
      months.set(monthKey, {
        key: monthKey,
        label,
        days: [],
        monthReturn: 0,
        weeks: [],
      });
    }
    const dayReturn = round(recs.reduce((s, r) => s + r.returnPct, 0), 2);
    months.get(monthKey)!.days.push({
      date: dateStr,
      value: dayReturn,
      trades: recs.length,
    });
  }

  // Fill days without trades as null in each month
  for (const [monthKey, month] of months) {
    const year = parseInt(monthKey.slice(0, 4));
    const mon = parseInt(monthKey.slice(5, 7)) - 1;
    const daysInMonth = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate();
    const existingDays = new Set(month.days.map((d) => d.date));
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${monthKey}-${String(d).padStart(2, "0")}`;
      if (!existingDays.has(dateStr)) {
        month.days.push({ date: dateStr, value: null, trades: 0 });
      }
    }
    month.days.sort((a, b) => a.date.localeCompare(b.date));
    month.monthReturn = round(
      month.days.reduce((s, d) => s + (d.value ?? 0), 0),
      2,
    );

    // Weekly aggregation
    const byWeek = groupBy(
      month.days.filter((d) => d.value !== null),
      (d) => {
        const date = new Date(d.date);
        const weekDay = date.getUTCDay();
        const diff = (weekDay + 6) % 7;
        date.setUTCDate(date.getUTCDate() - diff);
        return date.toISOString().slice(0, 10);
      },
    );
    month.weeks = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, days]) => ({
        label,
        value: round(days.reduce((s, d) => s + (d.value ?? 0), 0), 2),
      }));
  }

  return [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/* -------------------------------------------------------------------------- */
/* Trade distribution                                                          */
/* -------------------------------------------------------------------------- */

function buildTradeDistribution(records: LedgerRecord[]): TradeDistribution {
  const triggered = records.filter((r) => r.triggered);

  // Direction
  const longs = triggered.filter((r) => r.direction === "LONG");
  const shorts = triggered.filter((r) => r.direction === "SHORT");
  const direction = [
    {
      label: "LONG",
      trades: longs.length,
      winRate: pct(longs.filter((r) => r.outcome === "WIN").length, longs.length),
      netR: round(longs.reduce((s, r) => s + r.returnR, 0), 2),
    },
    {
      label: "SHORT",
      trades: shorts.length,
      winRate: pct(shorts.filter((r) => r.outcome === "WIN").length, shorts.length),
      netR: round(shorts.reduce((s, r) => s + r.returnR, 0), 2),
    },
  ];

  // Outcome
  const outcomes = ["WIN", "LOSS", "BREAKEVEN"] as const;
  const outcome = outcomes.map((o) => {
    const count = triggered.filter((r) => r.outcome === o).length;
    return { label: o, trades: count, share: pct(count, triggered.length) };
  });

  // Holding time distribution
  const holdingBins: DistributionBin[] = [
    { label: "<1h", count: 0, tone: "neutral" },
    { label: "1–6h", count: 0, tone: "neutral" },
    { label: "6–24h", count: 0, tone: "neutral" },
    { label: "1–3d", count: 0, tone: "neutral" },
    { label: "3d+", count: 0, tone: "neutral" },
  ];
  for (const r of triggered) {
    if (r.holdingHours < 1) holdingBins[0].count++;
    else if (r.holdingHours < 6) holdingBins[1].count++;
    else if (r.holdingHours < 24) holdingBins[2].count++;
    else if (r.holdingHours < 72) holdingBins[3].count++;
    else holdingBins[4].count++;
  }

  // Return distribution
  const returnBins: DistributionBin[] = [
    { label: "< -1R", count: 0, tone: "negative" },
    { label: "-1 to -0.5R", count: 0, tone: "negative" },
    { label: "-0.5 to 0R", count: 0, tone: "negative" },
    { label: "0 to 0.5R", count: 0, tone: "positive" },
    { label: "0.5 to 1R", count: 0, tone: "positive" },
    { label: "1 to 2R", count: 0, tone: "positive" },
    { label: "2R+", count: 0, tone: "positive" },
  ];
  for (const r of triggered) {
    if (r.returnR < -1) returnBins[0].count++;
    else if (r.returnR < -0.5) returnBins[1].count++;
    else if (r.returnR < 0) returnBins[2].count++;
    else if (r.returnR < 0.5) returnBins[3].count++;
    else if (r.returnR < 1) returnBins[4].count++;
    else if (r.returnR < 2) returnBins[5].count++;
    else returnBins[6].count++;
  }

  // Confidence distribution
  const confBins: DistributionBin[] = [
    { label: "55–64", count: 0, tone: "neutral" },
    { label: "65–74", count: 0, tone: "neutral" },
    { label: "75–84", count: 0, tone: "neutral" },
    { label: "85–94", count: 0, tone: "positive" },
    { label: "95–100", count: 0, tone: "positive" },
  ];
  for (const r of triggered) {
    if (r.confidence < 65) confBins[0].count++;
    else if (r.confidence < 75) confBins[1].count++;
    else if (r.confidence < 85) confBins[2].count++;
    else if (r.confidence < 95) confBins[3].count++;
    else confBins[4].count++;
  }

  return { direction, outcome, holdingTime: holdingBins, returns: returnBins, confidence: confBins };
}

/* -------------------------------------------------------------------------- */
/* Correlation matrix                                                          */
/* -------------------------------------------------------------------------- */

function buildCorrelationMatrix(records: LedgerRecord[]): CorrelationMatrix {
  const triggered = records.filter((r) => r.triggered);
  const slugs = [...new Set(triggered.map((r) => r.strategy))].sort();

  // Monthly net-R series per strategy
  const byMonth = groupBy(triggered, (r) => r.closedAt.slice(0, 7));
  const months = [...byMonth.keys()].sort();

  const series: Map<string, number[]> = new Map();
  for (const slug of slugs) {
    series.set(
      slug,
      months.map((m) => {
        const recs = (byMonth.get(m) ?? []).filter((r) => r.strategy === slug);
        return recs.reduce((s, r) => s + r.returnR, 0);
      }),
    );
  }

  // Pearson correlation
  function pearson(a: number[], b: number[]): number {
    const n = a.length;
    if (n < 3) return 0;
    const meanA = a.reduce((s, v) => s + v, 0) / n;
    const meanB = b.reduce((s, v) => s + v, 0) / n;
    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < n; i++) {
      const da = a[i] - meanA;
      const db = b[i] - meanB;
      num += da * db;
      denA += da * da;
      denB += db * db;
    }
    const den = Math.sqrt(denA * denB);
    return den === 0 ? 0 : round(num / den, 3);
  }

  const values: number[][] = slugs.map((a) =>
    slugs.map((b) => (a === b ? 1 : pearson(series.get(a)!, series.get(b)!))),
  );

  // Find complementary (lowest) and overlapping (highest) pairs
  const pairs: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < slugs.length; i++) {
    for (let j = i + 1; j < slugs.length; j++) {
      pairs.push({
        a: STRATEGY_ROSTER.find((s) => s.slug === slugs[i])?.name ?? slugs[i],
        b: STRATEGY_ROSTER.find((s) => s.slug === slugs[j])?.name ?? slugs[j],
        score: values[i][j],
      });
    }
  }
  pairs.sort((a, b) => a.score - b.score);

  return {
    strategies: slugs.map((slug) => ({
      slug,
      name: STRATEGY_ROSTER.find((s) => s.slug === slug)?.name ?? slug,
    })),
    values,
    complementary: pairs.slice(0, 3),
    overlapping: pairs.slice(-3).reverse(),
  };
}

/* -------------------------------------------------------------------------- */
/* Leaderboards                                                                */
/* -------------------------------------------------------------------------- */

function buildLeaderboards(strategies: StrategyPerformanceRow[]): LeaderboardEntry[] {
  if (strategies.length === 0) return [];

  const entries: LeaderboardEntry[] = [];

  const sorted = [...strategies];

  // Top Performer (net R)
  sorted.sort((a, b) => b.netR - a.netR);
  entries.push({
    key: "topPerformer",
    title: "Top Performer",
    strategy: sorted[0].name,
    metric: formatR(sorted[0].netR),
    metricLabel: "Net R",
    note: `${sorted[0].totalSignals} signals generated`,
  });

  // Most Consistent (trend = STABLE or IMPROVING + highest win rate)
  const consistent = sorted.filter((s) => s.trend !== "DECLINING").sort((a, b) => b.winRate - a.winRate);
  const con = consistent[0] ?? sorted[0];
  entries.push({
    key: "mostConsistent",
    title: "Most Consistent",
    strategy: con.name,
    metric: formatPct(con.winRate, false),
    metricLabel: "Win Rate",
    note: `Trend: ${con.trend.toLowerCase()}`,
  });

  // Highest Win Rate
  sorted.sort((a, b) => b.winRate - a.winRate);
  entries.push({
    key: "highestWinRate",
    title: "Highest Win Rate",
    strategy: sorted[0].name,
    metric: formatPct(sorted[0].winRate, false),
    metricLabel: "Win Rate",
    note: `${sorted[0].totalSignals} signals`,
  });

  // Highest Profit Factor
  sorted.sort((a, b) => b.profitFactor - a.profitFactor);
  entries.push({
    key: "highestProfitFactor",
    title: "Highest Profit Factor",
    strategy: sorted[0].name,
    metric: sorted[0].profitFactor.toFixed(2),
    metricLabel: "Profit Factor",
    note: `Expectancy: ${formatR(sorted[0].expectancy)}`,
  });

  // Most Active
  sorted.sort((a, b) => b.totalSignals - a.totalSignals);
  entries.push({
    key: "mostActive",
    title: "Most Active",
    strategy: sorted[0].name,
    metric: sorted[0].totalSignals.toLocaleString(),
    metricLabel: "Total Signals",
    note: `Win rate: ${formatPct(sorted[0].winRate, false)}`,
  });

  // Best Current (ACTIVE + highest net R in last 30 days-ish, approximated by trend + recent net R)
  const active = sorted.filter((s) => s.status === "ACTIVE").sort((a, b) => {
    const trendScore = (t: PerformanceTrend) => (t === "IMPROVING" ? 2 : t === "STABLE" ? 1 : 0);
    return trendScore(b.trend) - trendScore(a.trend) || b.netR - a.netR;
  });
  const best = active[0] ?? sorted[0];
  entries.push({
    key: "bestCurrent",
    title: "Best Current Performer",
    strategy: best.name,
    metric: formatR(best.netR),
    metricLabel: "Net R",
    note: `Trend: ${best.trend.toLowerCase()}`,
  });

  return entries;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build a complete analytics report from the mock ledger, filtered by the
 * given parameters. Pure function — no side effects.
 */
export function buildAnalyticsReport(filters: AnalyticsFilters): AnalyticsReport {
  const records = filterLedger(filters);

  // Compute a "previous" window of equal length for KPI deltas
  const windowDays = windowDaysForRange(filters.range);
  const prevStart = new Date(windowStartDate(filters.range));
  prevStart.setUTCDate(prevStart.getUTCDate() - windowDays);
  const prevEnd = windowStartDate(filters.range);

  const prevRecords = mockLedger.filter((r) => {
    const d = new Date(r.closedAt);
    if (d < prevStart || d >= prevEnd) return false;
    if (filters.strategy !== "ALL" && r.strategy !== filters.strategy) return false;
    if (filters.exchange !== "ALL" && r.exchange !== filters.exchange) return false;
    if (filters.regime !== "ALL" && r.regime !== filters.regime) return false;
    if (filters.direction !== "ALL" && r.direction !== filters.direction) return false;
    if (filters.timeframe !== "ALL" && r.timeframe !== filters.timeframe) return false;
    if (r.confidence < filters.confidenceMin || r.confidence > filters.confidenceMax) return false;
    return true;
  });

  const currentKpiRaw = computeKpiRaw(records);
  const previousKpiRaw = computeKpiRaw(prevRecords);

  const strategies = buildStrategyPerformance(records);
  const rangeLabel = DATE_RANGES.find((r) => r.key === filters.range)?.label ?? filters.range;

  return {
    meta: {
      rangeLabel,
      records: records.length,
      generatedAt: new Date().toISOString(),
      comparisonLabel: `previous ${rangeLabel.toLowerCase().replace("last ", "")}`,
    },
    kpis: buildKpis(currentKpiRaw, previousKpiRaw),
    equityCurve: buildEquityCurve(records),
    returns: buildReturnSeries(records),
    strategies,
    signalQuality: buildSignalQuality(records),
    risk: buildRiskAnalytics(records),
    regimes: buildRegimePerformance(records),
    heatmap: buildHeatmap(records),
    distribution: buildTradeDistribution(records),
    correlation: buildCorrelationMatrix(records),
    leaderboards: buildLeaderboards(strategies),
  };
}
