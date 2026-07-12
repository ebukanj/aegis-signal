"use client";

import { useMemo } from "react";
import {
  Activity,
  CircleOff,
  FlaskConical,
  Gauge,
  HeartPulse,
  Scale,
  Trophy,
  Zap,
} from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import type { StrategyProfile } from "@/features/strategies/types";
import { formatPercent } from "@/lib/format";

/** Roster-level aggregates: "how is the whole strategy fleet doing?" */
export function StrategyOverviewCards({
  strategies,
  loading,
}: {
  strategies: StrategyProfile[] | undefined;
  loading: boolean;
}) {
  const stats = useMemo(() => {
    if (!strategies || strategies.length === 0) return null;
    const active = strategies.filter((s) => s.status === "ACTIVE");
    const disabled = strategies.filter((s) => s.status === "DISABLED");
    const best = [...strategies].sort((a, b) => b.expectancy - a.expectancy)[0];
    const avg = (fn: (s: StrategyProfile) => number) =>
      strategies.reduce((sum, s) => sum + fn(s), 0) / strategies.length;
    return {
      total: strategies.length,
      active: active.length,
      disabled: disabled.length,
      best,
      avgWinRate: Math.round(avg((s) => s.winRate) * 10) / 10,
      avgProfitFactor: Math.round(avg((s) => s.profitFactor) * 100) / 100,
      avgExpectancy: Math.round(avg((s) => s.expectancy) * 100) / 100,
      avgHealth: Math.round(avg((s) => s.health.score)),
    };
  }, [strategies]);

  if (loading || !stats) {
    return (
      <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <MetricCard key={i} loading size="compact" label="" value="" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
      <MetricCard size="compact" label="Strategies" value={String(stats.total)} icon={FlaskConical} />
      <MetricCard size="compact" label="Active" value={String(stats.active)} icon={Activity} />
      <MetricCard size="compact" label="Disabled" value={String(stats.disabled)} icon={CircleOff} />
      <MetricCard
        size="compact"
        label="Best Performer"
        value={stats.best.name}
        hint={`${stats.best.expectancy}R expectancy`}
        icon={Trophy}
      />
      <MetricCard
        size="compact"
        label="Avg Win Rate"
        value={formatPercent(stats.avgWinRate, false)}
        icon={Gauge}
      />
      <MetricCard
        size="compact"
        label="Avg Profit Factor"
        value={String(stats.avgProfitFactor)}
        icon={Scale}
      />
      <MetricCard
        size="compact"
        label="Avg Expectancy"
        value={`${stats.avgExpectancy} R`}
        icon={Zap}
      />
      <MetricCard
        size="compact"
        label="Fleet Health"
        value={`${stats.avgHealth}/100`}
        icon={HeartPulse}
      />
    </div>
  );
}
