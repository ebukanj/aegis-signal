import type { Metadata } from "next";
import { PaperTradingWorkspace } from "@/features/paper-trading/components/paper-trading-workspace";

export const metadata: Metadata = {
  title: "Paper Trading",
  description: "Simulated execution and portfolio management environment.",
};

export default function PaperTradingPage() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PaperTradingWorkspace />
    </div>
  );
}
