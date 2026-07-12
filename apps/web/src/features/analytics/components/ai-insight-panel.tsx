"use client";

import {
  Brain,
  Lightbulb,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { ChartCard } from "@/components/shared/chart-card";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyticsAIInsights, AnalyticsInsight } from "../types";
import { cn } from "@/lib/utils";

interface AIInsightPanelProps {
  insights: AnalyticsAIInsights | undefined;
  loading?: boolean;
  className?: string;
}

const TONE_MAP: Record<AnalyticsInsight["tone"], { status: "success" | "error" | "warning" | "neutral"; label: string }> = {
  positive: { status: "success", label: "Positive" },
  negative: { status: "error", label: "Attention" },
  neutral: { status: "neutral", label: "Neutral" },
  warning: { status: "warning", label: "Warning" },
};

/**
 * AI analytics insights panel — displays mock AI-generated observations.
 * No real AI integration yet; the panel renders static mock data.
 */
export function AIInsightPanel({
  insights,
  loading = false,
  className,
}: AIInsightPanelProps) {
  if (loading || !insights) {
    return (
      <ChartCard
        title="AI Analytics Insights"
        headerSlot={
          <StatusBadge status="info" dot={false}>
            <Brain className="mr-1 size-3" aria-hidden />
            AI-Powered
          </StatusBadge>
        }
        className={className}
      >
        <Skeleton className="h-48 w-full" />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="AI Analytics Insights"
      description={insights.headline}
      headerSlot={
        <StatusBadge status="info" dot={false}>
          <Brain className="mr-1 size-3" aria-hidden />
          AI-Powered
        </StatusBadge>
      }
      className={className}
    >
      {/* Key insights */}
      <div className="grid gap-3 md:grid-cols-3">
        <InsightCard insight={insights.bestPerformer} />
        <InsightCard insight={insights.largestContributor} />
        <InsightCard insight={insights.biggestWeakness} />
      </div>

      {/* Lists */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <InsightList
          icon={Lightbulb}
          title="Suggested Improvements"
          items={insights.suggestedImprovements}
        />
        <InsightList
          icon={TrendingUp}
          title="Emerging Trends"
          items={insights.emergingTrends}
        />
        <InsightList
          icon={ShieldAlert}
          title="Risk Observations"
          items={insights.riskObservations}
        />
      </div>

      {/* Disclaimer */}
      <p className="mt-3 text-[10px] text-muted-foreground">
        AI insights are observational and do not constitute trading advice.
        All analysis is generated from mock data for demonstration purposes.
      </p>
    </ChartCard>
  );
}

function InsightCard({ insight }: { insight: AnalyticsInsight }) {
  const meta = TONE_MAP[insight.tone];
  return (
    <Card className="gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold">{insight.title}</span>
        <StatusBadge status={meta.status} dot={false} className="shrink-0 text-[10px]">
          {meta.label}
        </StatusBadge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {insight.detail}
      </p>
    </Card>
  );
}

function InsightList({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Lightbulb;
  title: string;
  items: string[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="label-caps">{title}</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
            <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-primary/40" aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
