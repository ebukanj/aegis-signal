import { create } from "zustand";
import type { BacktestConfig, SimulationState, BacktestResult } from "@/features/backtesting/types";
import { DEFAULT_BACKTEST_CONFIG } from "@/features/backtesting/types";

interface BacktestingStore {
  config: BacktestConfig;
  simulation: SimulationState;
  activeResult: BacktestResult | null;
  history: BacktestResult[];
  
  // Actions
  setConfig: <K extends keyof BacktestConfig>(key: K, value: BacktestConfig[K]) => void;
  resetConfig: () => void;
  setSimulationState: (state: Partial<SimulationState>) => void;
  setActiveResult: (result: BacktestResult) => void;
  clearActiveResult: () => void;
}

export const useBacktestingStore = create<BacktestingStore>((set) => ({
  config: { ...DEFAULT_BACKTEST_CONFIG },
  simulation: {
    phase: "IDLE",
    progress: 0,
    message: "Ready to run backtest",
  },
  activeResult: null,
  history: [], // For future comparison feature

  setConfig: (key, value) =>
    set((state) => ({
      config: { ...state.config, [key]: value },
    })),

  resetConfig: () =>
    set({ config: { ...DEFAULT_BACKTEST_CONFIG } }),

  setSimulationState: (newState) =>
    set((state) => ({
      simulation: { ...state.simulation, ...newState },
    })),

  setActiveResult: (result) =>
    set((state) => ({
      activeResult: result,
      history: [result, ...state.history],
    })),

  clearActiveResult: () =>
    set({ activeResult: null, simulation: { phase: "IDLE", progress: 0, message: "Ready to run backtest" } }),
}));
