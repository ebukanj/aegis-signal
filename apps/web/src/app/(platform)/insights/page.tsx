import type { Metadata } from "next";
import { InsightsPage } from "@/features/insights/components/insights-page";

export const metadata: Metadata = {
  title: "Insights",
  description: "News, social and fundamentals — the context behind the market.",
};

export default function Page() {
  return <InsightsPage />;
}
