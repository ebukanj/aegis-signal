"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { RISK_META } from "@/constants/domain";
import { HealthDashboard } from "@/features/strategies/components/health-dashboard";
import { HistoricalPerformanceCard } from "@/features/strategies/components/historical-performance-card";
import { MarketCompatibility } from "@/features/strategies/components/market-compatibility";
import { PerformanceAnalytics } from "@/features/strategies/components/performance-analytics";
import { StrategyConfiguration } from "@/features/strategies/components/strategy-configuration";
import { StrategyStatusBadge } from "@/features/strategies/components/strategy-status-badge";
import type { StrategyProfile } from "@/features/strategies/types";

// AI insights load last by design — they must never block the workspace
const AIStrategyInsights = dynamic(
  () =>
    import("@/features/strategies/components/ai-strategy-insights").then(
      (mod) => mod.AIStrategyInsights,
    ),
  { loading: () => <Skeleton className="h-48 w-full rounded-lg" /> },
);

interface StrategyDetailsProps {
  strategy: StrategyProfile;
  /** Mobile: return to the list view. */
  onBack?: () => void;
}

/** Full research profile for one strategy. */
export function StrategyDetails({ strategy, onBack }: StrategyDetailsProps) {
  const risk = RISK_META[strategy.recommendedRisk];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            {onBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="-ml-2 text-muted-foreground lg:hidden"
              >
                <ArrowLeft /> All strategies
              </Button>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">
                {strategy.name}
              </h2>
              <StrategyStatusBadge status={strategy.status} />
              <StatusBadge status="neutral" dot={false}>
                v{strategy.version}
              </StatusBadge>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {strategy.description}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.info("Favorites arrive with user preferences.")
              }
            >
              <Star /> Favorite
            </Button>
          </div>
        </div>

        {/* Profile meta */}
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
          <div>
            <dt className="label-caps">Market</dt>
            <dd className="mt-0.5 font-medium capitalize">
              {strategy.market.toLowerCase()}
            </dd>
          </div>
          <div>
            <dt className="label-caps">Timeframes</dt>
            <dd className="font-numeric mt-0.5 font-medium">
              {strategy.preferredTimeframes.join(" · ")}
            </dd>
          </div>
          <div>
            <dt className="label-caps">Exchanges</dt>
            <dd className="mt-0.5 font-medium">
              {strategy.supportedExchanges.length}
            </dd>
          </div>
          <div>
            <dt className="label-caps">Frequency</dt>
            <dd className="font-numeric mt-0.5 font-medium">
              ~{strategy.signalsPerWeek}/wk
            </dd>
          </div>
          <div>
            <dt className="label-caps">Recommended Risk</dt>
            <dd className="mt-0.5">
              <StatusBadge status={risk.status}>{risk.label}</StatusBadge>
            </dd>
          </div>
        </dl>
      </Card>

      <HealthDashboard strategy={strategy} />
      <PerformanceAnalytics strategy={strategy} />

      <div className="grid gap-4 xl:grid-cols-12">
        <MarketCompatibility strategy={strategy} className="xl:col-span-5" />
        <StrategyConfiguration strategy={strategy} className="xl:col-span-7" />
      </div>

      <HistoricalPerformanceCard strategy={strategy} />
      <AIStrategyInsights slug={strategy.slug} />
    </div>
  );
}
