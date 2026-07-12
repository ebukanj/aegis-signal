"use client";

import { useMemo } from "react";
import {
  Building2,
  Clock3,
  Eye,
  Gauge,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import type { Opportunity } from "@/features/scanner/types";
import { formatRelativeTime } from "@/lib/format";

interface ScannerSummaryProps {
  opportunities: Opportunity[] | undefined;
  loading: boolean;
  /** Timestamp of the last successful fetch. */
  updatedAt: number | undefined;
}

/**
 * Answers: "How much is out there right now?" — presentation-level counts
 * over the fetched set (real aggregates come from the API later).
 */
export function ScannerSummary({
  opportunities,
  loading,
  updatedAt,
}: ScannerSummaryProps) {
  const stats = useMemo(() => {
    if (!opportunities) return null;
    const active = opportunities.filter((o) => o.status !== "WATCHLIST");
    const longs = active.filter((o) => o.direction === "LONG").length;
    const shorts = active.length - longs;
    const highConfidence = opportunities.filter((o) => o.confidence >= 90).length;
    const watchlist = opportunities.filter((o) => o.status === "WATCHLIST").length;
    const avgConfidence = Math.round(
      opportunities.reduce((sum, o) => sum + o.confidence, 0) /
        Math.max(opportunities.length, 1),
    );
    const exchanges = new Set(opportunities.map((o) => o.exchange)).size;
    return {
      total: opportunities.length,
      highConfidence,
      longs,
      shorts,
      watchlist,
      avgConfidence,
      exchanges,
    };
  }, [opportunities]);

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
      <MetricCard size="compact" label="Opportunities" value={String(stats.total)} icon={Target} />
      <MetricCard
        size="compact"
        label="High Confidence"
        value={String(stats.highConfidence)}
        hint="Confidence ≥ 90"
        icon={Zap}
      />
      <MetricCard size="compact" label="Long" value={String(stats.longs)} icon={TrendingUp} />
      <MetricCard size="compact" label="Short" value={String(stats.shorts)} icon={TrendingDown} />
      <MetricCard size="compact" label="Watchlist" value={String(stats.watchlist)} icon={Eye} />
      <MetricCard
        size="compact"
        label="Avg Confidence"
        value={String(stats.avgConfidence)}
        icon={Gauge}
      />
      <MetricCard
        size="compact"
        label="Exchanges"
        value={String(stats.exchanges)}
        icon={Building2}
      />
      <MetricCard
        size="compact"
        label="Last Scan"
        value={updatedAt ? formatRelativeTime(new Date(updatedAt).toISOString()) : "—"}
        icon={Clock3}
      />
    </div>
  );
}
