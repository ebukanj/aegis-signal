import type { AreaChartPoint } from "@/components/shared/charts/area-chart";
import type { BarChartPoint } from "@/components/shared/charts/bar-chart";
import type {
  MarketRegime,
  SignalDirection,
  SignalOutcome,
  Timeframe,
} from "@/types/domain";

/**
 * Analytics Center view models — DTO-shaped; only `api/analytics-api.ts`
 * changes when the backend Analytics module ships.
 *
 * Every panel on the page is derived from one signal ledger
 * (strategies.md §Cross-Module: "log for every signal — timestamp, asset,
 * direction, entry/SL/TP, confidence, regime state, outcome in R"). The
 * frontend never computes these values: it renders a precomputed report.
 */

/* -------------------------------------------------------------------------- */
/* Filters                                                                     */
/* -------------------------------------------------------------------------- */

export type DateRangeKey = "30d" | "90d" | "6m" | "12m";

export const DATE_RANGES: { key: DateRangeKey; label: string; days: number }[] = [
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "6m", label: "Last 6 months", days: 182 },
  { key: "12m", label: "Last 12 months", days: 365 },
];

/** `ALL` is the unfiltered sentinel for every categorical dimension. */
export type Filterable<T extends string> = T | "ALL";

export interface AnalyticsFilters {
  range: DateRangeKey;
  strategy: Filterable<string>; // strategy slug
  exchange: Filterable<string>;
  regime: Filterable<MarketRegime>;
  direction: Filterable<SignalDirection>;
  timeframe: Filterable<Timeframe>;
  /** Inclusive confidence bounds, 0–100. */
  confidenceMin: number;
  confidenceMax: number;
}

export const DEFAULT_FILTERS: AnalyticsFilters = {
  range: "90d",
  strategy: "ALL",
  exchange: "ALL",
  regime: "ALL",
  direction: "ALL",
  timeframe: "ALL",
  confidenceMin: 0,
  confidenceMax: 100,
};

/* -------------------------------------------------------------------------- */
/* Signal ledger (the fact table the backend will own)                         */
/* -------------------------------------------------------------------------- */

export interface LedgerRecord {
  id: string;
  strategy: string; // slug
  strategyName: string;
  coin: string;
  exchange: string;
  direction: SignalDirection;
  timeframe: Timeframe;
  regime: MarketRegime;
  confidence: number; // 0–100
  generatedAt: string; // ISO
  closedAt: string; // ISO — expiry time for signals that never triggered
  /** False ⇒ the signal expired before entry; it has no outcome. */
  triggered: boolean;
  outcome: SignalOutcome | null;
  /** Realized R multiple. 0 for signals that never triggered. */
  returnR: number;
  /** Realized portfolio impact, percent. */
  returnPct: number;
  /** Percent of portfolio risked at the stop. */
  riskPercent: number;
  holdingHours: number;
  /** Whether price reached TP1 at any point — a loss that never did is a false positive. */
  reachedTp1: boolean;
  /** Hours from entry to first target; null for trades that never reached it. */
  hoursToTarget: number | null;
}

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

/** Stable identifiers so the UI can attach icons without the DTO carrying them. */
export type KpiKey =
  | "totalSignals"
  | "winRate"
  | "lossRate"
  | "profitFactor"
  | "netReturn"
  | "expectancy"
  | "avgRMultiple"
  | "avgHoldingTime"
  | "maxDrawdown"
  | "avgConfidence"
  | "activeStrategies"
  | "totalTrades";

export interface AnalyticsKpi {
  key: KpiKey;
  label: string;
  /** Preformatted by the report builder — the card never does math. */
  value: string;
  /** Change vs. the preceding window of equal length. */
  delta?: string;
  /** Numeric direction of the change — drives the glyph. */
  deltaDirection: "up" | "down" | "flat";
  /**
   * Whether the change is good or bad. Decoupled from direction because a
   * rising drawdown moves up but is bad.
   */
  deltaTone: "positive" | "negative" | "neutral";
  hint?: string;
}

export interface ReturnSeries {
  cumulative: AreaChartPoint[];
  daily: BarChartPoint[];
  weekly: BarChartPoint[];
  monthly: BarChartPoint[];
}

export type PerformanceTrend = "IMPROVING" | "STABLE" | "DECLINING";

export interface StrategyPerformanceRow {
  slug: string;
  name: string;
  className: string;
  status: "ACTIVE" | "PROBATION" | "DISABLED";
  winRate: number;
  profitFactor: number;
  expectancy: number; // R per closed trade
  avgReturnR: number; // average winner
  avgConfidence: number;
  maxDrawdown: number; // percent, negative
  totalSignals: number;
  netR: number;
  trend: PerformanceTrend;
  /** Radar dimensions, each normalized 0–100 for cross-strategy comparison. */
  radar: Record<StrategyRadarAxis, number>;
}

export const STRATEGY_RADAR_AXES = [
  "Win Rate",
  "Profit Factor",
  "Expectancy",
  "Consistency",
  "Risk Control",
  "Activity",
] as const;
export type StrategyRadarAxis = (typeof STRATEGY_RADAR_AXES)[number];

export type ConfidenceBucketKey = "HIGH" | "MEDIUM" | "LOW";

export interface ConfidenceBucket {
  key: ConfidenceBucketKey;
  label: string;
  /** e.g. "85–100". */
  range: string;
  signals: number;
  triggered: number;
  wins: number;
  successRate: number; // percent of triggered
  avgR: number;
  /** Calibration: does this bucket out-perform the bucket below it? */
  calibrated: boolean;
}

export interface SignalQuality {
  buckets: ConfidenceBucket[];
  /** Losses that never reached TP1 — the signal was simply wrong. */
  falsePositives: number;
  falsePositiveRate: number;
  /**
   * Requires a ledger of *rejected* candidates, which the backend does not
   * log yet. Null renders as "not measured" rather than a fabricated zero.
   */
  falseNegatives: number | null;
  expiredSignals: number;
  expiryRate: number;
  avgHoursToTarget: number;
  /** Monthly success rate of triggered signals — the quality trend. */
  successTrend: { label: string; value: number }[];
  /** True when every bucket out-performs the one below it. */
  confidenceIsCalibrated: boolean;
}

export interface ExposureSlice {
  label: string;
  /** Share of total risk deployed, percent. */
  share: number;
  netR: number;
}

export interface RiskAnalytics {
  drawdownCurve: AreaChartPoint[];
  maxDrawdown: number; // percent, negative
  currentDrawdown: number; // percent, negative
  /** Histogram of per-trade risk, percent of portfolio. */
  riskDistribution: DistributionBin[];
  avgRisk: number;
  largestWinR: number;
  largestLossR: number;
  /** 0–100 aggregate exposure heat. */
  portfolioHeat: number;
  exposureByStrategy: ExposureSlice[];
  exposureByExchange: ExposureSlice[];
}

export interface RegimePerformance {
  regime: MarketRegime;
  signals: number;
  winRate: number;
  expectancy: number;
  netR: number;
  avgConfidence: number;
  /** Days the market spent in this regime within the window. */
  days: number;
  /** Best-performing strategy in this regime, by net R. */
  bestStrategy: string | null;
}

export interface HeatmapDay {
  date: string; // ISO date (YYYY-MM-DD)
  /** Portfolio return for the day, percent. Null = no trades closed. */
  value: number | null;
  trades: number;
}

export interface HeatmapMonth {
  /** e.g. "2026-03". */
  key: string;
  label: string; // "Mar 2026"
  days: HeatmapDay[];
  monthReturn: number;
  /** ISO week label → return percent. */
  weeks: { label: string; value: number }[];
}

export interface DistributionBin {
  label: string;
  count: number;
  /** Semantic tone for the bar. */
  tone: "positive" | "negative" | "neutral";
}

export interface TradeDistribution {
  direction: { label: string; trades: number; winRate: number; netR: number }[];
  outcome: { label: string; trades: number; share: number }[];
  holdingTime: DistributionBin[];
  returns: DistributionBin[];
  confidence: DistributionBin[];
}

export interface CorrelationMatrix {
  strategies: { slug: string; name: string }[];
  /** Row-major Pearson correlation of monthly net-R series, −1…1. */
  values: number[][];
  /** Lowest-correlation pairs — the diversifiers. */
  complementary: { a: string; b: string; score: number }[];
  /** Highest-correlation pairs — redundant risk. */
  overlapping: { a: string; b: string; score: number }[];
}

export type LeaderboardKey =
  | "topPerformer"
  | "mostConsistent"
  | "highestWinRate"
  | "highestProfitFactor"
  | "mostActive"
  | "bestCurrent";

export interface LeaderboardEntry {
  key: LeaderboardKey;
  title: string;
  strategy: string | null;
  /** Preformatted headline metric. */
  metric: string;
  metricLabel: string;
  note: string;
}

export interface AnalyticsReport {
  meta: {
    rangeLabel: string;
    /** Records in the window after filters. */
    records: number;
    generatedAt: string;
    /** Comparison window label, e.g. "previous 90 days". */
    comparisonLabel: string;
  };
  kpis: AnalyticsKpi[];
  equityCurve: AreaChartPoint[];
  returns: ReturnSeries;
  strategies: StrategyPerformanceRow[];
  signalQuality: SignalQuality;
  risk: RiskAnalytics;
  regimes: RegimePerformance[];
  heatmap: HeatmapMonth[];
  distribution: TradeDistribution;
  correlation: CorrelationMatrix;
  leaderboards: LeaderboardEntry[];
}

/* -------------------------------------------------------------------------- */
/* AI insights                                                                 */
/* -------------------------------------------------------------------------- */

export interface AnalyticsInsight {
  title: string;
  detail: string;
  tone: "positive" | "negative" | "neutral" | "warning";
}

export interface AnalyticsAIInsights {
  headline: string;
  bestPerformer: AnalyticsInsight;
  largestContributor: AnalyticsInsight;
  biggestWeakness: AnalyticsInsight;
  suggestedImprovements: string[];
  emergingTrends: string[];
  riskObservations: string[];
}
