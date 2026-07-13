"use client";

import { Trash2 } from "lucide-react";
import { describeCondition } from "@aegis/contracts";
import type {
  Condition,
  Indicator,
  Operand,
  Operator,
  Timeframe,
} from "@aegis/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * One condition: `left <operator> right`.
 *
 * Two things this must get right, both of which the first version got wrong:
 *
 * 1. THE RIGHT SIDE IS NOT ALWAYS A NUMBER. "Price is above the highest high
 *    (20)" compares an indicator to another *indicator*. The first editor only
 *    offered a number box, so it could not express the rules it was editing —
 *    and touching that box would have silently turned "above the highest high"
 *    into "above 0", destroying the strategy.
 *
 * 2. A CONDITION CAN LOOK AT A DIFFERENT TIMEFRAME. This is what makes a
 *    strategy multi-timeframe: a 1h rule asking "but is the 4h trend up?".
 *    Every operand carries its own optional timeframe; blank means the
 *    strategy's own.
 */

export const INDICATORS: { value: Indicator; label: string }[] = [
  { value: "close", label: "Price" },
  { value: "high", label: "High" },
  { value: "low", label: "Low" },
  { value: "volume", label: "Volume" },
  { value: "volume_sma", label: "Average volume" },
  { value: "ema", label: "EMA" },
  { value: "sma", label: "Simple moving average" },
  { value: "rsi", label: "RSI" },
  { value: "adx", label: "ADX (trend strength)" },
  { value: "atr", label: "ATR (volatility)" },
  { value: "bb_upper", label: "Upper Bollinger Band" },
  { value: "bb_middle", label: "Bollinger midline" },
  { value: "bb_lower", label: "Lower Bollinger Band" },
  { value: "highest_high", label: "Highest high" },
  { value: "lowest_low", label: "Lowest low" },
  { value: "vwap", label: "VWAP" },
  { value: "zscore", label: "Z-score" },
  { value: "funding_rate", label: "Funding rate" },
  { value: "open_interest", label: "Open interest" },
];

const OPERATORS: { value: Operator; label: string }[] = [
  { value: "gt", label: "is above" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is below" },
  { value: "lte", label: "is at most" },
  { value: "crosses_above", label: "crosses above" },
  { value: "crosses_below", label: "crosses below" },
];

const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];

/** Indicators that need a lookback period. Raw price and volume do not. */
export const NEEDS_PERIOD = new Set<Indicator>([
  "ema", "sma", "rsi", "adx", "atr", "bb_upper", "bb_middle", "bb_lower",
  "bb_width", "highest_high", "lowest_low", "zscore", "volume_sma",
]);

const SAME_TF = "__same__";

export function ConditionRow({
  condition,
  strategyTimeframe,
  onChange,
  onRemove,
}: {
  condition: Condition;
  strategyTimeframe: Timeframe;
  onChange: (condition: Condition) => void;
  onRemove?: () => void;
}) {
  const rightIsNumber = condition.right.kind === "number";

  return (
    <div className="space-y-2 rounded-md border p-3">
      {/* Left operand */}
      <OperandEditor
        operand={condition.left}
        strategyTimeframe={strategyTimeframe}
        onChange={(left) => onChange({ ...condition, left })}
        allowNumber={false}
      />

      {/* Operator + right side kind */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={condition.op}
          onValueChange={(v: Operator) => onChange({ ...condition, op: v })}
        >
          <SelectTrigger className="w-40" aria-label="Comparison">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={rightIsNumber ? "number" : "indicator"}
          onValueChange={(v) =>
            onChange({
              ...condition,
              right:
                v === "number"
                  ? { kind: "number", value: 0 }
                  : { kind: "indicator", indicator: "ema", period: 20 },
            })
          }
        >
          <SelectTrigger className="w-32" aria-label="Compare against">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="number">a value</SelectItem>
            <SelectItem value="indicator">an indicator</SelectItem>
          </SelectContent>
        </Select>

        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            aria-label="Remove condition"
            className="ml-auto text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        )}
      </div>

      {/* Right operand */}
      <OperandEditor
        operand={condition.right}
        strategyTimeframe={strategyTimeframe}
        onChange={(right) => onChange({ ...condition, right })}
        allowNumber
      />

      {/* Read the rule back in plain English — the same renderer the card uses */}
      <p className="border-t pt-2 text-xs text-muted-foreground">
        {describeCondition(condition)}
      </p>
    </div>
  );
}

function OperandEditor({
  operand,
  strategyTimeframe,
  onChange,
  allowNumber,
}: {
  operand: Operand;
  strategyTimeframe: Timeframe;
  onChange: (operand: Operand) => void;
  allowNumber: boolean;
}) {
  if (operand.kind === "number") {
    if (!allowNumber) return null;
    return (
      <Input
        type="number"
        step="any"
        value={operand.value}
        onChange={(e) =>
          onChange({ kind: "number", value: Number(e.target.value) })
        }
        className="w-32 font-numeric"
        aria-label="Value"
      />
    );
  }

  const { indicator, period, timeframe, multiplier } = operand;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={indicator}
        onValueChange={(v: Indicator) =>
          onChange({
            ...operand,
            indicator: v,
            period: NEEDS_PERIOD.has(v) ? (period ?? 14) : undefined,
          })
        }
      >
        <SelectTrigger className="w-48" aria-label="Indicator">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INDICATORS.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {NEEDS_PERIOD.has(indicator) && (
        <Input
          type="number"
          min={1}
          value={period ?? 14}
          onChange={(e) =>
            onChange({ ...operand, period: Math.max(1, Number(e.target.value)) })
          }
          className="w-20 font-numeric"
          aria-label="Period"
          title="Lookback period"
        />
      )}

      {/* Multi-timeframe: blank = the strategy's own timeframe */}
      <Select
        value={timeframe ?? SAME_TF}
        onValueChange={(v) =>
          onChange({
            ...operand,
            timeframe: v === SAME_TF ? undefined : (v as Timeframe),
          })
        }
      >
        <SelectTrigger className="w-32" aria-label="Timeframe">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SAME_TF}>on {strategyTimeframe}</SelectItem>
          {TIMEFRAMES.map((t) => (
            <SelectItem key={t} value={t}>
              on {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Multiplier — how "volume ≥ 1.5× its average" is expressed */}
      <Input
        type="number"
        min={0.1}
        step={0.1}
        value={multiplier ?? 1}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange({ ...operand, multiplier: v === 1 ? undefined : v });
        }}
        className="w-20 font-numeric"
        aria-label="Multiplier"
        title="Multiplier — e.g. 1.5 for 1.5× average volume"
      />
    </div>
  );
}
