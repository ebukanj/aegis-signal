import { useCallback } from "react";
import { useBacktestingStore } from "@/stores/backtesting-store";
import { backtestingApi } from "@/features/backtesting/api/backtesting-api";
import { toast } from "sonner";

/**
 * Hook to manage the backtest execution flow.
 * Coordinates between the UI form, the Zustand store, and the mock API.
 * Simulates the progressive phases of an institutional backtest engine.
 */
export function useBacktestExecution() {
  const config = useBacktestingStore((s) => s.config);
  const setSimulationState = useBacktestingStore((s) => s.setSimulationState);
  const setActiveResult = useBacktestingStore((s) => s.setActiveResult);
  const clearActiveResult = useBacktestingStore((s) => s.clearActiveResult);

  const runBacktest = useCallback(async () => {
    try {
      // 1. Preparation Phase
      clearActiveResult();
      setSimulationState({ phase: "PREPARING_DATA", progress: 10, message: "Fetching historical market data..." });
      
      await new Promise(r => setTimeout(r, 600));

      // 2. Execution Phase
      setSimulationState({ phase: "RUNNING_STRATEGY", progress: 40, message: "Executing strategy logic..." });
      
      await new Promise(r => setTimeout(r, 1200));

      // 3. Calculation Phase
      setSimulationState({ phase: "CALCULATING_METRICS", progress: 75, message: "Calculating performance metrics and drawdowns..." });
      
      // Hit the "API" to generate the result
      const result = await backtestingApi.runBacktest(config);

      // 4. Reporting Phase
      setSimulationState({ phase: "BUILDING_REPORT", progress: 90, message: "Assembling final report..." });
      
      await new Promise(r => setTimeout(r, 400));

      // 5. Completion
      setSimulationState({ phase: "COMPLETED", progress: 100, message: "Backtest completed successfully." });
      setActiveResult(result);
      
      toast.success("Backtest completed", { description: "Simulation results are now available." });

    } catch (error) {
      setSimulationState({ phase: "FAILED", progress: 0, message: "Simulation failed due to an unexpected error." });
      toast.error("Backtest failed", { description: "An error occurred during execution." });
      console.error(error);
    }
  }, [config, setSimulationState, setActiveResult, clearActiveResult]);

  return { runBacktest };
}
