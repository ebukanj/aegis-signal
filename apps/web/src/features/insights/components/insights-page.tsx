"use client";

import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { insightsApi } from "@/features/insights/api/insights-api";
import { FundamentalsFeed } from "@/features/insights/components/fundamentals-feed";
import { MarketSummaryCard } from "@/features/insights/components/market-summary";
import { NewsFeed } from "@/features/insights/components/news-feed";
import { RiskFlags } from "@/features/insights/components/risk-flags";
import { SocialFeed } from "@/features/insights/components/social-feed";
import { EconomicCalendar } from "@/features/macro/components/economic-calendar";

/**
 * Insights — news, social, fundamentals.
 *
 * The rule that governs this entire page, stated on it so nobody has to guess:
 *
 *   **NOTHING HERE CREATES A SIGNAL.**
 *
 * A story is a reason to look, never a reason to buy. Every signal still comes
 * from a strategy document evaluated deterministically (ADR-023), and the chart
 * must agree before anything reaches you. This is Founding Principle 9 — AI
 * assists, AI does not decide — and it is the difference between a research desk
 * and a hype feed.
 *
 * What insights *can* do is the opposite: **stop** a trade. A Risk Flag on a
 * hacked coin blocks every strategy from touching it, however good the setup
 * looks. That is why Risk Flags sit at the top of this page and everything else
 * sits below them.
 */
export function InsightsPage() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["insights", "feed"],
    queryFn: () => insightsApi.getFeed(),
  });

  if (isError) {
    return (
      <ErrorState
        title="Insights unavailable"
        description="The intelligence feed could not be loaded."
        onRetry={() => refetch()}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-16">
      <PageHeader
        title="Insights"
        description="News, social and fundamentals — the context behind the market."
      />

      {/* The rule, stated plainly and up front. */}
      <div className="flex gap-2 rounded-lg border border-dashed px-4 py-3">
        <Info
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            Nothing on this page creates a signal.
          </span>{" "}
          A story is a reason to look, never a reason to buy — every signal still
          has to be earned on the chart. What this page{" "}
          <span className="font-medium text-foreground">can</span> do is stop a
          trade: a risk flag on a hacked coin blocks every strategy from touching
          it, however good the setup looks.
        </p>
      </div>

      {isPending || !data ? (
        <LoadingState />
      ) : (
        <>
          <RiskFlags flags={data.riskFlags} />
          <MarketSummaryCard summary={data.summary} />

          {/* Macro — the scheduled events that move everything at once. Live. */}
          <EconomicCalendar />

          <div className="grid gap-6 xl:grid-cols-2">
            <NewsFeed news={data.news} />
            <SocialFeed social={data.social} />
          </div>

          <FundamentalsFeed fundamentals={data.fundamentals} />
        </>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}
