"use client";

import { PageHeader } from "@/components/shared/page-header";
import { ExportToolbar } from "./export-toolbar";
import { useAnalyticsStore } from "@/stores/analytics-store";
import { DATE_RANGES } from "../types";

/**
 * Analytics Center header: title, date range context, and export toolbar.
 */
export function AnalyticsHeader() {
  const range = useAnalyticsStore((s) => s.filters.range);
  const rangeLabel =
    DATE_RANGES.find((r) => r.key === range)?.label ?? range;

  return (
    <PageHeader
      title="Analytics Center"
      description={`Performance intelligence · ${rangeLabel}`}
      actions={<ExportToolbar />}
    />
  );
}
