"use client";

import { BookmarkPlus, ChevronDown, RotateCcw, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { REGIME_META, RISK_META } from "@/constants/domain";
import { scannerFilterOptions } from "@/features/scanner/data/mock-opportunities";
import {
  DEFAULT_SCANNER_FILTERS,
  type ScannerFilters,
} from "@/features/scanner/types";
import type {
  MarketRegime,
  RiskLevel,
  SignalDirection,
  Timeframe,
} from "@/types/domain";

interface ScannerToolbarProps {
  filters: ScannerFilters;
  onFiltersChange: (filters: ScannerFilters) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

/** Filter/search/refresh controls for the opportunity table. */
export function ScannerToolbar({
  filters,
  onFiltersChange,
  onRefresh,
  refreshing,
}: ScannerToolbarProps) {
  const set = <K extends keyof ScannerFilters>(
    key: K,
    value: ScannerFilters[K],
  ) => onFiltersChange({ ...filters, [key]: value });

  const isDirty =
    JSON.stringify(filters) !== JSON.stringify(DEFAULT_SCANNER_FILTERS);

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={filters.search}
          onValueChange={(value) => set("search", value)}
          placeholder="Search coin, pair, exchange, strategy…"
          aria-label="Search opportunities"
          className="w-full sm:w-72"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.info("Saved filter presets arrive with user preferences.")
            }
          >
            <BookmarkPlus /> Save preset
          </Button>
          {isDirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFiltersChange(DEFAULT_SCANNER_FILTERS)}
            >
              <RotateCcw /> Reset
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Refresh opportunities"
              >
                <RefreshCw className={refreshing ? "animate-spin" : undefined} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Rescan now</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <FilterSelect
          label="Exchange"
          value={filters.exchange}
          onChange={(v) => set("exchange", v)}
          options={scannerFilterOptions.exchanges.map((e) => [e, e])}
        />
        {/* Multi-select: combine strategies for confluence-focused results */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between font-normal"
              aria-label="Filter by strategies (multi-select)"
            >
              <span className="truncate">
                <span className="text-muted-foreground">Strategy:</span>{" "}
                {filters.strategies.length === 0
                  ? "All"
                  : filters.strategies.length === 1
                    ? filters.strategies[0]
                    : `${filters.strategies.length} selected`}
              </span>
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Select one or more strategies
            </DropdownMenuLabel>
            {scannerFilterOptions.strategies.map((strategy) => (
              <DropdownMenuCheckboxItem
                key={strategy}
                checked={filters.strategies.includes(strategy)}
                onCheckedChange={(checked) =>
                  set(
                    "strategies",
                    checked
                      ? [...filters.strategies, strategy]
                      : filters.strategies.filter((s) => s !== strategy),
                  )
                }
                onSelect={(event) => event.preventDefault()}
              >
                {strategy}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <FilterSelect
          label="Regime"
          value={filters.regime}
          onChange={(v) => set("regime", v as MarketRegime | "ALL")}
          options={Object.entries(REGIME_META).map(([key, meta]) => [
            key,
            meta.label,
          ])}
        />
        <FilterSelect
          label="Risk"
          value={filters.riskLevel}
          onChange={(v) => set("riskLevel", v as RiskLevel | "ALL")}
          options={Object.entries(RISK_META).map(([key, meta]) => [
            key,
            meta.label,
          ])}
        />
        <FilterSelect
          label="Timeframe"
          value={filters.timeframe}
          onChange={(v) => set("timeframe", v as Timeframe | "ALL")}
          options={scannerFilterOptions.timeframes.map((t) => [t, t])}
        />
        <FilterSelect
          label="Direction"
          value={filters.direction}
          onChange={(v) => set("direction", v as SignalDirection | "ALL")}
          options={[
            ["LONG", "Long"],
            ["SHORT", "Short"],
          ]}
        />

        <div className="col-span-2 flex items-center gap-3 rounded-md border px-3 py-1.5 sm:col-span-1">
          <Label
            htmlFor="min-confidence"
            className="label-caps shrink-0 cursor-pointer"
          >
            Conf ≥ <span className="font-numeric text-foreground">{filters.minConfidence}</span>
          </Label>
          <Slider
            id="min-confidence"
            value={[filters.minConfidence]}
            onValueChange={([value]) => set("minConfidence", value)}
            min={0}
            max={95}
            step={5}
            aria-label="Minimum confidence"
          />
        </div>
      </div>
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** [value, label] pairs — "All" is prepended automatically. */
  options: [string, string][];
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="w-full" aria-label={`Filter by ${label}`}>
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">All</SelectItem>
        {options.map(([optionValue, optionLabel]) => (
          <SelectItem key={optionValue} value={optionValue}>
            {optionLabel}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
