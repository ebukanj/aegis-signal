import type { Metadata } from "next";
import { BacktestWorkspace } from "@/features/backtesting/components/backtest-workspace";

export const metadata: Metadata = {
  title: "Backtesting Laboratory",
  description:
    "Quantitative research environment — validate strategies against historical market data before live deployment.",
};

/**
 * Backtesting Laboratory page.
 * Answers: "Would this strategy have worked under these historical market conditions?"
 */
export default function BacktestingPage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <BacktestWorkspace />
    </div>
  );
}
