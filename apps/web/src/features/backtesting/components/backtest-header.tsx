"use client";

import { PageHeader } from "@/components/shared/page-header";
import { ExportToolbar } from "./export-toolbar";
import { useBacktestingStore } from "@/stores/backtesting-store";
import { STRATEGY_ROSTER } from "@/constants/strategies";

/**
 * Backtesting header: title, active strategy context, and export toolbar.
 */
export function BacktestHeader() {
  const result = useBacktestingStore((s) => s.activeResult);
  
  let description = "Quantitative research and strategy validation";
  if (result) {
    const stratName = result.config.strategy === "ALL" 
      ? "Portfolio Backtest" 
      : STRATEGY_ROSTER.find(s => s.slug === result.config.strategy)?.name ?? result.config.strategy;
    
    description = `Viewing results for ${stratName} · ${result.summary.totalTrades} trades simulated`;
  }

  return (
    <PageHeader
      title="Backtesting Laboratory"
      description={description}
      actions={<ExportToolbar />}
    />
  );
}
