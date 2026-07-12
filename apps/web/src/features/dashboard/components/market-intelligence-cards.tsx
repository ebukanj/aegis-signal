"use client";

import { Activity, Gauge, ShieldAlert, Target } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";
import { MetricCard } from "@/components/shared/metric-card";
import { REGIME_META, RISK_META } from "@/constants/domain";
import { useMarketIntelligence } from "@/features/dashboard/hooks/use-dashboard-data";
import { formatPercent } from "@/lib/format";

/**
 * Answers: "What kind of market am I in, and how risky is it?"
 * Regime, sentiment, overall risk, and live opportunity count.
 */
export function MarketIntelligenceCards() {
  const { data, isPending, isError, refetch } = useMarketIntelligence();

  if (isError) {
    return (
      <ErrorState
        title="Market intelligence unavailable"
        description="The market intelligence feed could not be loaded."
        onRetry={() => refetch()}
        className="col-span-full min-h-[120px] p-6"
      />
    );
  }

  if (isPending) {
    return (
      <>
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCard key={i} loading label="" value="" />
        ))}
      </>
    );
  }

  const regime = REGIME_META[data.regime];
  const risk = RISK_META[data.riskLevel];

  return (
    <>
      <MetricCard
        label="Market Regime"
        value={regime.label}
        hint={`Confidence ${data.regimeConfidence}/100`}
        icon={Activity}
      />
      <MetricCard
        label="Market Sentiment"
        value={`${data.sentiment}`}
        delta={data.sentimentLabel}
        deltaDirection={data.sentiment >= 55 ? "up" : data.sentiment <= 45 ? "down" : "flat"}
        hint={`BTC dominance ${formatPercent(data.btcDominance, false)}`}
        icon={Gauge}
      />
      <MetricCard
        label="Overall Risk"
        value={risk.label}
        hint={`Risk score ${data.riskScore}/100`}
        icon={ShieldAlert}
      />
      <MetricCard
        label="Active Opportunities"
        value={String(data.activeOpportunities)}
        hint={`${data.watchlistCount} on watchlist`}
        icon={Target}
      />
    </>
  );
}
