import type { BacktestConfig, BacktestResult } from "../types";
import { generateMockBacktest } from "../data/mock-backtest";

/**
 * Backtesting API access.
 * Currently simulates running a backtest by generating mock data after a delay.
 * When the backend Backtesting engine is implemented, this will hit a REST
 * endpoint or connect to a WebSocket for progress updates.
 */

const simulate = <T>(data: T, delayMs = 1500): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), delayMs));

export const backtestingApi = {
  /**
   * Run a backtest with the given configuration.
   * This is mocked to return synchronously after a simulated delay,
   * but the hook handles progressive state updates to simulate a real engine.
   */
  runBacktest: (config: BacktestConfig): Promise<BacktestResult> =>
    simulate(generateMockBacktest(config), 3000), // 3-second delay to allow progress UI
};
