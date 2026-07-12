"use client";

import { useMemo, useState } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { OpportunityCards } from "@/features/scanner/components/opportunity-cards";
import { OpportunityTable } from "@/features/scanner/components/opportunity-table";
import { PreviewDrawer } from "@/features/scanner/components/preview-drawer";
import { ScannerSummary } from "@/features/scanner/components/scanner-summary";
import { ScannerToolbar } from "@/features/scanner/components/scanner-toolbar";
import {
  useFilteredOpportunities,
  useOpportunities,
} from "@/features/scanner/hooks/use-opportunities";
import {
  DEFAULT_SCANNER_FILTERS,
  type Opportunity,
  type ScannerFilters,
} from "@/features/scanner/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

/**
 * Market Scanner workspace. Answers:
 * "What are the best opportunities in the market right now?"
 */
export function ScannerPage() {
  const [filters, setFilters] = useState<ScannerFilters>(
    DEFAULT_SCANNER_FILTERS,
  );
  const [preview, setPreview] = useState<Opportunity | null>(null);

  const { data, isPending, isError, refetch, isRefetching, dataUpdatedAt } =
    useOpportunities();

  // Debounce only the search text so typing never re-filters on each keystroke
  const debouncedSearch = useDebouncedValue(filters.search, 250);
  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch],
  );
  const filtered = useFilteredOpportunities(data, effectiveFilters);

  if (isError) {
    return (
      <ErrorState
        title="Scanner unavailable"
        description="The opportunity feed could not be loaded."
        onRetry={() => refetch()}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Market Scanner"
        description="Ranked opportunities that passed strategy evaluation and risk validation."
      />

      <ScannerSummary
        opportunities={data}
        loading={isPending}
        updatedAt={dataUpdatedAt || undefined}
      />

      <ScannerToolbar
        filters={filters}
        onFiltersChange={setFilters}
        onRefresh={() => refetch()}
        refreshing={isRefetching}
      />

      {/* Desktop/tablet: table · Mobile: cards */}
      <div className="hidden md:block">
        <OpportunityTable
          opportunities={filtered}
          loading={isPending}
          onPreview={setPreview}
        />
      </div>
      <div className="md:hidden">
        <OpportunityCards
          opportunities={filtered}
          loading={isPending}
          onPreview={setPreview}
        />
      </div>

      <PreviewDrawer
        opportunity={preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      />
    </div>
  );
}
