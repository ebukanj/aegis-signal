"use client";

import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { useAnalyticsStore } from "@/stores/analytics-store";
import { STRATEGY_ROSTER } from "@/constants/strategies";
import { LEDGER_EXCHANGES } from "../data/mock-ledger";
import { DATE_RANGES } from "../types";
import type { MarketRegime, SignalDirection, Timeframe } from "@/types/domain";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const REGIMES: { value: MarketRegime | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Regimes" },
  { value: "TRENDING_BULL", label: "Trending Bull" },
  { value: "TRENDING_BEAR", label: "Trending Bear" },
  { value: "RANGE", label: "Ranging" },
  { value: "TRANSITION", label: "Transitioning" },
  { value: "HIGH_VOLATILITY", label: "High Volatility" },
  { value: "RISK_OFF", label: "Risk-Off" },
];

const DIRECTIONS: { value: SignalDirection | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Directions" },
  { value: "LONG", label: "Long" },
  { value: "SHORT", label: "Short" },
];

const TIMEFRAMES: { value: Timeframe | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Timeframes" },
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1d" },
];

interface AnalyticsFiltersProps {
  className?: string;
}

/**
 * Filter bar for the Analytics Center. Controls: date range, strategy,
 * exchange, regime, direction, timeframe, confidence slider, reset.
 */
export function AnalyticsFilters({ className }: AnalyticsFiltersProps) {
  const filters = useAnalyticsStore((s) => s.filters);
  const setFilter = useAnalyticsStore((s) => s.setFilter);
  const resetFilters = useAnalyticsStore((s) => s.resetFilters);

  return (
    <Card className={cn("flex flex-wrap items-end gap-3 p-3 md:p-4", className)}>
      {/* Date Range */}
      <FilterSelect
        label="Date Range"
        value={filters.range}
        onValueChange={(v) => setFilter("range", v as typeof filters.range)}
        options={DATE_RANGES.map((r) => ({ value: r.key, label: r.label }))}
      />

      {/* Strategy */}
      <FilterSelect
        label="Strategy"
        value={filters.strategy}
        onValueChange={(v) => setFilter("strategy", v)}
        options={[
          { value: "ALL", label: "All Strategies" },
          ...STRATEGY_ROSTER.map((s) => ({ value: s.slug, label: s.name })),
        ]}
      />

      {/* Exchange */}
      <FilterSelect
        label="Exchange"
        value={filters.exchange}
        onValueChange={(v) => setFilter("exchange", v)}
        options={[
          { value: "ALL", label: "All Exchanges" },
          ...LEDGER_EXCHANGES.map((e) => ({ value: e, label: e })),
        ]}
      />

      {/* Market Regime */}
      <FilterSelect
        label="Regime"
        value={filters.regime}
        onValueChange={(v) => setFilter("regime", v as typeof filters.regime)}
        options={REGIMES}
      />

      {/* Direction */}
      <FilterSelect
        label="Direction"
        value={filters.direction}
        onValueChange={(v) => setFilter("direction", v as typeof filters.direction)}
        options={DIRECTIONS}
      />

      {/* Timeframe */}
      <FilterSelect
        label="Timeframe"
        value={filters.timeframe}
        onValueChange={(v) => setFilter("timeframe", v as typeof filters.timeframe)}
        options={TIMEFRAMES}
      />

      {/* Confidence Range */}
      <div className="min-w-[160px] space-y-1.5">
        <span className="label-caps">
          Confidence: {filters.confidenceMin}–{filters.confidenceMax}
        </span>
        <Slider
          min={0}
          max={100}
          step={5}
          value={[filters.confidenceMin, filters.confidenceMax]}
          onValueChange={([min, max]) => {
            setFilter("confidenceMin", min);
            setFilter("confidenceMax", max);
          }}
          aria-label="Confidence range"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          <RotateCcw className="mr-1.5 size-3.5" />
          Reset
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.info("Save View — available in a future release.")}
        >
          <Save className="mr-1.5 size-3.5" />
          <span className="hidden sm:inline">Save View</span>
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Internal helper                                                             */
/* -------------------------------------------------------------------------- */

function FilterSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-[130px] space-y-1.5">
      <span className="label-caps">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-8 text-xs" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
