"use client";

import {
  Activity,
  BarChart3,
  Clock,
  Crosshair,
  Flame,
  Percent,
  Sigma,
  Target,
  TrendingDown,
  TrendingUp,
  LineChart,
} from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import type { BacktestPerformanceSummary } from "../types";
import { cn } from "@/lib/utils";

interface PerformanceSummaryProps {
  summary: BacktestPerformanceSummary;
  className?: string;
}

const formatR = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
const formatPct = (v: number, signed = true) => `${signed && v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const formatDollar = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const formatHours = (h: number): string => {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};

/**
 * KPI Grid for Backtest Results. 
 * Shows Net Profit, Returns, Drawdown, Profit Factor, Expectancy, Sharpe/Sortino ratios, etc.
 */
export function PerformanceSummary({ summary, className }: PerformanceSummaryProps) {
  return (
    <div
      className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6", className)}
      role="region"
      aria-label="Backtest Performance Metrics"
    >
      <MetricCard
        label="Net Profit"
        value={formatDollar(summary.netProfit)}
        icon={TrendingUp}
        delta={formatPct(summary.totalReturnPct)}
        deltaDirection={summary.netProfit >= 0 ? "up" : "down"}
      />
      <MetricCard
        label="Max Drawdown"
        value={formatPct(summary.maxDrawdownPct, false)}
        icon={Flame}
        hint="Peak-to-trough decline"
      />
      <MetricCard
        label="Profit Factor"
        value={summary.profitFactor.toFixed(2)}
        icon={BarChart3}
        hint="Gross Profit / Gross Loss"
      />
      <MetricCard
        label="Win Rate"
        value={formatPct(summary.winRate, false)}
        icon={Target}
        hint={`${summary.totalTrades} total trades`}
      />
      <MetricCard
        label="Expectancy"
        value={formatR(summary.expectancyR)}
        icon={Sigma}
        hint="Average R per trade"
      />
      <MetricCard
        label="Avg R Multiple"
        value={formatR(summary.avgRMultiple)}
        icon={Crosshair}
        hint="Average winning trade"
      />
      
      {/* Risk-Adjusted Ratios (Placeholders requested by PRD) */}
      <MetricCard
        label="Sharpe Ratio"
        value={summary.sharpeRatio.toFixed(2)}
        icon={Activity}
        hint="Risk-adjusted return"
      />
      <MetricCard
        label="Sortino Ratio"
        value={summary.sortinoRatio.toFixed(2)}
        icon={Activity}
        hint="Downside risk-adjusted"
      />
      <MetricCard
        label="Calmar Ratio"
        value={summary.calmarRatio.toFixed(2)}
        icon={LineChart}
        hint="Return vs. Max Drawdown"
      />
      
      <MetricCard
        label="Avg Holding Time"
        value={formatHours(summary.avgHoldingHours)}
        icon={Clock}
      />
      <MetricCard
        label="Total Trades"
        value={summary.totalTrades.toLocaleString()}
        icon={Percent}
      />
      <MetricCard
        label="Avg Win vs Loss"
        value={`${summary.avgRMultiple.toFixed(2)} : 1`}
        icon={TrendingDown}
      />
    </div>
  );
}
