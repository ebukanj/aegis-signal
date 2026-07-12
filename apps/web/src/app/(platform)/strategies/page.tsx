import type { Metadata } from "next";
import { StrategyLabPage } from "@/features/strategies/components/strategy-lab-page";

export const metadata: Metadata = { title: "Strategy Laboratory" };

export default function Page() {
  return <StrategyLabPage />;
}
