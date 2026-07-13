"use client";

import { useMemo, useState } from "react";
import { GitCompareArrows } from "lucide-react";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StrategyComparison } from "@/features/strategies/components/strategy-comparison";
import { StrategyDetails } from "@/features/strategies/components/strategy-details";
import { StrategyList } from "@/features/strategies/components/strategy-list";
import { StrategyOverviewCards } from "@/features/strategies/components/strategy-overview-cards";
import { useStrategies } from "@/features/strategies/hooks/use-strategies";
import type { StrategyStatus } from "@/features/strategies/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

type SortKey = "health" | "expectancy" | "winRate" | "name";

/**
 * Strategy Laboratory. Answers:
 * "Which strategy is best suited for the current market?"
 * Desktop: split-view research workspace. Mobile: list → detail navigation.
 */
export function StrategyLabPage() {
  const { data, isPending, isError, refetch } = useStrategies();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StrategyStatus | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("health");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  /** Mobile: whether the detail pane is the active view. */
  const [mobileDetail, setMobileDetail] = useState(false);
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 200);

  const filtered = useMemo(() => {
    if (!data) return [];
    const query = debouncedSearch.trim().toLowerCase();
    const list = data.filter((s) => {
      if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
      if (query && !`${s.name} ${s.description}`.toLowerCase().includes(query))
        return false;
      return true;
    });
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "health":
          return b.health.score - a.health.score;
        case "expectancy":
          return b.expectancy - a.expectancy;
        case "winRate":
          return b.winRate - a.winRate;
        case "name":
          return a.name.localeCompare(b.name);
      }
    });
  }, [data, debouncedSearch, statusFilter, sortKey]);

  const selected =
    data?.find((s) => s.slug === selectedSlug) ?? filtered[0] ?? null;
  const compared = (data ?? []).filter((s) => compareSlugs.includes(s.slug));

  if (isError) {
    return (
      <ErrorState
        title="Strategy Laboratory unavailable"
        description="Strategy profiles could not be loaded."
        onRetry={() => refetch()}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Strategy Laboratory"
        description="Analyze, compare, and configure the strategies competing for the platform's risk budget."
        actions={
          compareSlugs.length >= 2 ? (
            <Button size="sm" onClick={() => setCompareOpen(true)}>
              <GitCompareArrows /> Compare ({compareSlugs.length})
            </Button>
          ) : undefined
        }
      />

      <StrategyOverviewCards strategies={data} loading={isPending} />

      {/* Explorer controls */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search strategies…"
          aria-label="Search strategies"
          className="w-full sm:w-64"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StrategyStatus | "ALL")}
        >
          <SelectTrigger size="sm" className="w-36" aria-label="Filter by status">
            <span className="text-muted-foreground">Status:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PROBATION">Probation</SelectItem>
            <SelectItem value="DISABLED">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger size="sm" className="w-40" aria-label="Sort strategies">
            <span className="text-muted-foreground">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="health">Health</SelectItem>
            <SelectItem value="expectancy">Expectancy</SelectItem>
            <SelectItem value="winRate">Win rate</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Split view: list (left) + details (right); stacked navigation on mobile */}
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div
          className={cn(
            "lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pr-1",
            mobileDetail && "hidden lg:block",
          )}
        >
          <StrategyList
            strategies={filtered}
            loading={isPending}
            selectedSlug={selected?.slug ?? null}
            onSelect={(slug) => {
              setSelectedSlug(slug);
              setMobileDetail(true);
            }}
            compareSlugs={compareSlugs}
            onToggleCompare={(slug) =>
              setCompareSlugs((prev) =>
                prev.includes(slug)
                  ? prev.filter((s) => s !== slug)
                  : prev.length >= 4
                    ? prev // cap at 4 for readable comparison
                    : [...prev, slug],
              )
            }
          />
        </div>

        <div className={cn("min-w-0", !mobileDetail && "hidden lg:block")}>
          {selected ? (
            <StrategyDetails
              strategy={selected}
              onBack={() => setMobileDetail(false)}
            />
          ) : null}
        </div>
      </div>

      <StrategyComparison
        strategies={compared}
        open={compareOpen && compared.length >= 2}
        onOpenChange={setCompareOpen}
      />
    </div>
  );
}
