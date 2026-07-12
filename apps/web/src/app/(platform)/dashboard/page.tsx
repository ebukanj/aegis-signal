import type { Metadata } from "next";
import { ActivityTimeline } from "@/features/dashboard/components/activity-timeline";
import { BestOpportunityCard } from "@/features/dashboard/components/best-opportunity-card";
import { DashboardGrid } from "@/features/dashboard/components/dashboard-grid";
import { DashboardHeader } from "@/features/dashboard/components/dashboard-header";
import { MarketIntelligenceCards } from "@/features/dashboard/components/market-intelligence-cards";
import { MarketOverviewChart } from "@/features/dashboard/components/market-overview-chart";
import { PlatformHealthCard } from "@/features/dashboard/components/platform-health-card";
import { QuickActions } from "@/features/dashboard/components/quick-actions";
import { SignalsTable } from "@/features/dashboard/components/signals-table";
import { StrategyPerformance } from "@/features/dashboard/components/strategy-performance";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The primary workspace. Answers: "What should the trader know right now?"
 * Hierarchy: market state → platform trust → opportunities → context.
 * Each DashboardGrid child is one row; rows use a 12-column grid.
 */
export default function DashboardPage() {
  return (
    <DashboardGrid>
      {/* Who/when/what state — orientation in under a second */}
      <DashboardHeader />

      {/* The headline: the single best actionable opportunity right now */}
      <BestOpportunityCard />

      {/* One-click entry into the main workflows */}
      <QuickActions />

      {/* Market intelligence + platform trust, side by side */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 grid gap-4 sm:grid-cols-2 lg:col-span-8">
          <MarketIntelligenceCards />
        </div>
        <PlatformHealthCard className="col-span-12 lg:col-span-4" />
      </div>

      {/* The opportunities that matter right now */}
      <SignalsTable />

      {/* Market anchor context */}
      <MarketOverviewChart />

      {/* Strategy competition + platform activity */}
      <div className="grid grid-cols-12 gap-4">
        <StrategyPerformance className="col-span-12 lg:col-span-7" />
        <ActivityTimeline className="col-span-12 lg:col-span-5" />
      </div>
    </DashboardGrid>
  );
}
