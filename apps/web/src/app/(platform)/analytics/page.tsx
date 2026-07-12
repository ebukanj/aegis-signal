import type { Metadata } from "next";
import { AnalyticsCenterContent } from "@/features/analytics/components/analytics-center-content";

export const metadata: Metadata = {
  title: "Analytics Center",
  description:
    "Performance intelligence workspace — evaluate strategies, analyze signals, and identify improvements.",
};

/**
 * Analytics Center page.
 * Answers: "What does the data tell me, and what should I improve?"
 *
 * The server component sets metadata; all interactive content lives in
 * AnalyticsCenterContent (a client component) which owns the query hooks,
 * filter store, and chart interactions.
 */
export default function AnalyticsPage() {
  return <AnalyticsCenterContent />;
}
