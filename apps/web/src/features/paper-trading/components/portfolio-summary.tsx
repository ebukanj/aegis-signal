import { MetricCard } from "@/components/shared/metric-card";
import { formatPrice, formatPercent } from "@/lib/format";
import { Wallet, TrendingUp, Activity, Crosshair, DollarSign, Target } from "lucide-react";
import type { PortfolioSummary as IPortfolioSummary } from "../types";

export function PortfolioSummary({ summary }: { summary: IPortfolioSummary }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
      role="region"
      aria-label="Portfolio Summary Metrics"
    >
      <MetricCard
        label="Portfolio Value"
        value={formatPrice(summary.portfolioValue)}
        icon={Wallet}
        delta={formatPercent(summary.todayReturnPct)}
        deltaDirection={summary.todayReturnPct >= 0 ? "up" : "down"}
        hint="Today's Return"
      />
      <MetricCard
        label="Cash Balance"
        value={formatPrice(summary.cashBalance)}
        icon={DollarSign}
        hint="Available for trading"
      />
      <MetricCard
        label="Unrealized PnL"
        value={formatPrice(summary.unrealizedPnL)}
        icon={Activity}
        delta={formatPercent(summary.unrealizedPnLPct)}
        deltaDirection={summary.unrealizedPnL >= 0 ? "up" : "down"}
      />
      <MetricCard
        label="Realized PnL"
        value={formatPrice(summary.realizedPnL)}
        icon={TrendingUp}
        delta={`${summary.closedTradesCount} trades`}
        deltaDirection="flat"
      />
      <MetricCard
        label="Win Rate"
        value={formatPercent(summary.winRate)}
        icon={Target}
        hint="All-time closed"
      />
      <MetricCard
        label="Active Risk"
        value={formatPercent(summary.portfolioRisk)}
        icon={Crosshair}
        hint="Of portfolio capital"
      />
    </div>
  );
}
