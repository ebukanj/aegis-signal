"use client";

import { Suspense } from "react";
import { StaggeredRows } from "@/components/shared/staggered-rows";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/error-state";
import {
  useAnalyticsReport,
  useAnalyticsInsights,
} from "../hooks/use-analytics-data";
import { AnalyticsHeader } from "./analytics-header";
import { AnalyticsFilters } from "./analytics-filters";
import { KpiOverview } from "./kpi-overview";
import { EquityCurve } from "./equity-curve";
import { StrategyComparisonTable } from "./strategy-comparison-table";
import { StrategyRadar } from "./strategy-radar";
import { SignalQualityCard } from "./signal-quality-card";
import { RiskMetricsCard } from "./risk-metrics-card";
import { MarketRegimeChart } from "./market-regime-chart";
import { HeatmapCalendar } from "./heatmap-calendar";
import { TradeDistributionChart } from "./trade-distribution-chart";
import { StrategyCorrelationMatrix } from "./strategy-correlation-matrix";
import { LeaderboardCards } from "./leaderboard-cards";
import { AIInsightPanel } from "./ai-insight-panel";

/**
 * The full Analytics Center composition. Client component — owns the
 * TanStack Query hooks and Zustand filter store integration.
 *
 * Layout hierarchy:
 * Header → Filters → KPIs → Performance → Strategy Comparison →
 * Signal Quality → Risk → Market Regime → Heatmap → Trade Distribution →
 * Correlation → Leaderboards → AI Insights
 */
export function AnalyticsCenterContent() {
  const {
    data: report,
    isLoading: reportLoading,
    isError: reportError,
    refetch: refetchReport,
  } = useAnalyticsReport();

  const {
    data: insights,
    isLoading: insightsLoading,
  } = useAnalyticsInsights();

  if (reportError) {
    return (
      <div className="flex flex-col gap-4">
        <AnalyticsHeader />
        <AnalyticsFilters />
        <ErrorState
          title="Failed to load analytics"
          description="The analytics report could not be generated. Try adjusting filters or retrying."
          onRetry={() => refetchReport()}
        />
      </div>
    );
  }

  return (
    <StaggeredRows>
      {/* Header */}
      <AnalyticsHeader />

      {/* Filters */}
      <AnalyticsFilters />

      {/* KPI Overview */}
      <KpiOverview kpis={report?.kpis ?? []} loading={reportLoading} />

      {/* Performance Chart | Equity Curve */}
      <EquityCurve
        equityCurve={report?.equityCurve ?? []}
        returns={report?.returns ?? { cumulative: [], daily: [], weekly: [], monthly: [] }}
        loading={reportLoading}
      />

      {/* Strategy Comparison: table + radar side by side on large screens */}
      <div className="grid grid-cols-12 gap-4">
        <StrategyComparisonTable
          strategies={report?.strategies ?? []}
          loading={reportLoading}
          className="col-span-12 xl:col-span-8"
        />
        <StrategyRadar
          strategies={report?.strategies ?? []}
          loading={reportLoading}
          className="col-span-12 xl:col-span-4"
        />
      </div>

      {/* Signal Quality Analysis */}
      <SignalQualityCard
        quality={report?.signalQuality ?? { buckets: [], falsePositives: 0, falsePositiveRate: 0, falseNegatives: null, expiredSignals: 0, expiryRate: 0, avgHoursToTarget: 0, successTrend: [], confidenceIsCalibrated: false }}
        loading={reportLoading}
      />

      {/* Risk Metrics */}
      <RiskMetricsCard
        risk={report?.risk ?? { drawdownCurve: [], maxDrawdown: 0, currentDrawdown: 0, riskDistribution: [], avgRisk: 0, largestWinR: 0, largestLossR: 0, portfolioHeat: 0, exposureByStrategy: [], exposureByExchange: [] }}
        loading={reportLoading}
      />

      {/* Market Regime Performance */}
      <MarketRegimeChart
        regimes={report?.regimes ?? []}
        loading={reportLoading}
      />

      {/* Monthly Heatmap */}
      <HeatmapCalendar
        heatmap={report?.heatmap ?? []}
        loading={reportLoading}
      />

      {/* Trade Distribution */}
      <TradeDistributionChart
        distribution={report?.distribution ?? { direction: [], outcome: [], holdingTime: [], returns: [], confidence: [] }}
        loading={reportLoading}
      />

      {/* Strategy Correlation */}
      <StrategyCorrelationMatrix
        correlation={report?.correlation ?? { strategies: [], values: [], complementary: [], overlapping: [] }}
        loading={reportLoading}
      />

      {/* Leaderboards */}
      <LeaderboardCards
        leaderboards={report?.leaderboards ?? []}
        loading={reportLoading}
      />

      {/* AI Insights */}
      <AIInsightPanel
        insights={insights}
        loading={insightsLoading}
      />
    </StaggeredRows>
  );
}
