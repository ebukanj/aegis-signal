"use client";

import { usePaperTradingStore } from "../stores/paper-trading-store";
import type { PaperTradingTab } from "../stores/paper-trading-store";
import { mockPortfolioData } from "../data/mock-portfolio";
import { PaperTradingHeader } from "./paper-trading-header";
import { PortfolioSummary } from "./portfolio-summary";
import { PortfolioChart } from "./portfolio-chart";
import { PortfolioAllocation } from "./portfolio-allocation";
import { OpenPositions } from "./open-positions";
import { PositionDrawer } from "./position-drawer";
import { ClosedTrades } from "./closed-trades";
import { TradingJournal } from "./trading-journal";
import { PortfolioStatistics } from "./portfolio-statistics";
import { RiskDashboard } from "./risk-dashboard";
import { TradingCalendar } from "./trading-calendar";
import { PortfolioCoach } from "./portfolio-coach";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PaperTradingWorkspace() {
  const { activeTab, setActiveTab, selectedPosition, setSelectedPosition } = usePaperTradingStore();
  
  // Using static mock data directly for UI purposes
  const data = mockPortfolioData;

  return (
    <div className="flex flex-col gap-6 pb-20">
      <PaperTradingHeader />
      
      <PortfolioSummary summary={data.summary} />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PaperTradingTab)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="risk">Risk & Stats</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid gap-6 lg:grid-cols-3">
            <PortfolioChart data={data.chartData} className="lg:col-span-2" />
            <PortfolioAllocation allocation={data.allocation} className="lg:col-span-1" />
          </div>
          
          <OpenPositions 
            positions={data.openPositions} 
            onRowClick={(pos) => setSelectedPosition(pos)} 
          />
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <ClosedTrades trades={data.closedTrades} />
        </TabsContent>

        {/* JOURNAL TAB */}
        <TabsContent value="journal" className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid gap-6 lg:grid-cols-4">
            <div className="lg:col-span-1">
              <PortfolioCoach />
            </div>
            <div className="lg:col-span-3">
              <TradingJournal journals={data.journals} trades={data.closedTrades} />
            </div>
          </div>
        </TabsContent>

        {/* RISK & STATS TAB */}
        <TabsContent value="risk" className="space-y-6 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <PortfolioStatistics stats={data.stats} />
          <div className="grid gap-6 lg:grid-cols-2">
            <RiskDashboard risk={data.risk} />
            <TradingCalendar days={data.calendarData} />
          </div>
        </TabsContent>
      </Tabs>

      <PositionDrawer 
        position={selectedPosition}
        open={!!selectedPosition}
        onOpenChange={(o) => !o && setSelectedPosition(null)}
      />
    </div>
  );
}
