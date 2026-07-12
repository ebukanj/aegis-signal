"use client";

import { useState } from "react";
import { useBacktestingStore } from "@/stores/backtesting-store";
import { BacktestHeader } from "./backtest-header";
import { BacktestConfiguration } from "./backtest-configuration";
import { SimulationProgress } from "./simulation-progress";
import { PerformanceSummary } from "./performance-summary";
import { BacktestEquityCurve } from "./backtest-equity-curve";
import { DrawdownAnalysis } from "./drawdown-analysis";
import { TradeDistribution } from "./trade-distribution";
import { MarketConditionAnalysis } from "./market-condition-analysis";
import { TradeTable } from "./trade-table";
import { TradeDrawer } from "./trade-drawer";
import { StrategyComparison } from "./strategy-comparison";
import { AIBacktestInsights } from "./ai-backtest-insights";
import { MonteCarloPlaceholder } from "./monte-carlo-placeholder";
import type { BacktestTrade } from "../types";

/**
 * Master orchestrator layout for the Backtesting Laboratory.
 */
export function BacktestWorkspace() {
  const simulation = useBacktestingStore((s) => s.simulation);
  const result = useBacktestingStore((s) => s.activeResult);
  
  const [selectedTrade, setSelectedTrade] = useState<BacktestTrade | null>(null);

  const isRunning = simulation.phase !== "IDLE" && simulation.phase !== "COMPLETED" && simulation.phase !== "FAILED";

  return (
    <div className="flex flex-col gap-6">
      <BacktestHeader />
      
      {/* Top Configuration Area */}
      <section>
        <BacktestConfiguration />
      </section>

      {/* Progress Indicator (shown when running or idle/failed) */}
      {(!result || isRunning) && (
        <section>
          <SimulationProgress />
        </section>
      )}

      {/* Results Dashboard (shown only when completed) */}
      {result && !isRunning && (
        <section className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          <PerformanceSummary summary={result.summary} />
          
          <div className="grid gap-6 lg:grid-cols-3">
            <BacktestEquityCurve data={result.equityCurve} className="lg:col-span-2" />
            <TradeDistribution trades={result.trades} className="lg:col-span-1" />
          </div>

          <DrawdownAnalysis curve={result.drawdownCurve} analysis={result.drawdownAnalysis} />

          <div className="grid gap-6 lg:grid-cols-2">
            <MarketConditionAnalysis trades={result.trades} />
            <AIBacktestInsights insights={result.aiInsights} />
          </div>

          <StrategyComparison />

          <TradeTable 
            trades={result.trades} 
            onRowClick={(trade) => setSelectedTrade(trade)} 
          />

          <MonteCarloPlaceholder />

          <TradeDrawer 
            trade={selectedTrade} 
            open={!!selectedTrade} 
            onOpenChange={(o) => !o && setSelectedTrade(null)} 
          />

        </section>
      )}
    </div>
  );
}
