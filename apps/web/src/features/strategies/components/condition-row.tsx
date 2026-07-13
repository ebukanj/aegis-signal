"use client";

import { Trash2 } from "lucide-react";
import {
  BAR_COUNT_OPERATORS,
  GEOMETRIC_PATTERNS,
  PATTERN_WORDS,
  describeCondition,
} from "@aegis/contracts";
import type {
  ComparisonCondition,
  Condition,
  Indicator,
  Operand,
  Operator,
  Pattern,
  Timeframe,
} from "@aegis/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

/**
 * One condition — either a comparison, or a pattern.
 *
 * The two are genuinely different shapes and pretending otherwise was never an
 * option: "a falling wedge has formed" is not `[indicator] [operator] [value]`.
 * It has no left side and no number to compare against. So the row switches on
 * what you are asking for (ADR-024).
 *
 * Multi-timeframe throughout: every operand and every pattern carries its own
 * optional timeframe, which is how a 1h rule asks "but is the 4h trend up?".
 */

export const INDICATOR_GROUPS: {
  label: string;
  items: { value: Indicator; label: string }[];
}[] = [
  {
    label: "Price & volume",
    items: [
      { value: "close", label: "Price" },
      { value: "high", label: "High" },
      { value: "low", label: "Low" },
      { value: "volume", label: "Volume" },
      { value: "volume_sma", label: "Average volume" },
      { value: "obv", label: "On-balance volume" },
      { value: "cvd", label: "Cumulative volume delta" },
      { value: "vwap", label: "VWAP" },
    ],
  },
  {
    label: "Momentum",
    items: [
      { value: "rsi", label: "RSI" },
      { value: "macd_line", label: "MACD line" },
      { value: "macd_signal", label: "MACD signal" },
      { value: "macd_histogram", label: "MACD histogram" },
      { value: "stoch_k", label: "Stochastic %K" },
      { value: "stoch_d", label: "Stochastic %D" },
      { value: "kdj_k", label: "KDJ — K" },
      { value: "kdj_d", label: "KDJ — D" },
      { value: "kdj_j", label: "KDJ — J" },
      { value: "cci", label: "CCI" },
      { value: "williams_r", label: "Williams %R" },
      { value: "roc", label: "Rate of change" },
      { value: "mfi", label: "Money flow index" },
    ],
  },
  {
    label: "Trend",
    items: [
      { value: "ema", label: "EMA" },
      { value: "sma", label: "Simple moving average" },
      { value: "adx", label: "ADX (trend strength)" },
      { value: "plus_di", label: "+DI" },
      { value: "minus_di", label: "−DI" },
      { value: "supertrend", label: "Supertrend" },
      { value: "psar", label: "Parabolic SAR" },
      { value: "ichimoku_tenkan", label: "Ichimoku conversion" },
      { value: "ichimoku_kijun", label: "Ichimoku base" },
      { value: "ichimoku_span_a", label: "Ichimoku cloud top" },
      { value: "ichimoku_span_b", label: "Ichimoku cloud bottom" },
    ],
  },
  {
    label: "Volatility",
    items: [
      { value: "atr", label: "ATR" },
      { value: "bb_upper", label: "Upper Bollinger Band" },
      { value: "bb_middle", label: "Bollinger midline" },
      { value: "bb_lower", label: "Lower Bollinger Band" },
      { value: "bb_width", label: "Bollinger width" },
      { value: "keltner_upper", label: "Upper Keltner" },
      { value: "keltner_lower", label: "Lower Keltner" },
      { value: "donchian_upper", label: "Donchian high" },
      { value: "donchian_lower", label: "Donchian low" },
      { value: "zscore", label: "Z-score" },
    ],
  },
  {
    label: "Structure",
    items: [
      { value: "highest_high", label: "Highest high" },
      { value: "lowest_low", label: "Lowest low" },
    ],
  },
  {
    label: "Derivatives (needs a feed we don't have)",
    items: [
      { value: "funding_rate", label: "Funding rate" },
      { value: "open_interest", label: "Open interest" },
      { value: "long_short_ratio", label: "Long/short ratio" },
    ],
  },
];

const OPERATORS: { value: Operator; label: string }[] = [
  { value: "gt", label: "is above" },
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is below" },
  { value: "lte", label: "is at most" },
  { value: "crosses_above", label: "crosses above" },
  { value: "crosses_below", label: "crosses below" },
  { value: "rising", label: "has been rising for" },
  { value: "falling", label: "has been falling for" },
  { value: "diverges_bullish", label: "shows bullish divergence over" },
  { value: "diverges_bearish", label: "shows bearish divergence over" },
];

const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];

/** Indicators needing a lookback period. Raw price and volume do not. */
export const NEEDS_PERIOD = new Set<Indicator>([
  "ema", "sma", "rsi", "adx", "atr", "bb_upper", "bb_middle", "bb_lower",
  "bb_width", "keltner_upper", "keltner_lower", "donchian_upper",
  "donchian_lower", "highest_high", "lowest_low", "zscore", "volume_sma",
  "stoch_k", "stoch_d", "kdj_k", "kdj_d", "kdj_j", "cci", "williams_r",
  "roc", "mfi", "supertrend",
]);

const STRUCTURE_PATTERNS = (
  Object.keys(PATTERN_WORDS) as Pattern[]
).filter((p) => !(GEOMETRIC_PATTERNS as string[]).includes(p));

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
  return (
    <div className="space-y-2 rounded-md border p-3">
      {/* What kind of question are you asking? */}
      <div className="flex items-center gap-2">
        <Select
          value={condition.kind}
          onValueChange={(kind) =>
            onChange(
              kind === "pattern"
                ? { kind: "pattern", pattern: "BULL_FLAG", minQuality: 0.7 }
                : {
                    kind: "comparison",
                    left: { kind: "indicator", indicator: "rsi", period: 14 },
                    op: "lt",
                    right: { kind: "number", value: 30 },
                  },
            )
          }
        >
          <SelectTrigger className="w-44" aria-label="Condition type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comparison">An indicator…</SelectItem>
            <SelectItem value="pattern">A chart pattern…</SelectItem>
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

      {condition.kind === "pattern" ? (
        <PatternEditor
          condition={condition}
          strategyTimeframe={strategyTimeframe}
          onChange={onChange}
        />
      ) : (
        <ComparisonEditor
          condition={condition}
          strategyTimeframe={strategyTimeframe}
          onChange={onChange}
        />
      )}

      {/* The rule, read back in plain English — the same renderer the card uses */}
      <p className="border-t pt-2 text-xs text-muted-foreground">
        {describeCondition(condition)}
      </p>
    </div>
  );
}

function PatternEditor({
  condition,
  strategyTimeframe,
  onChange,
}: {
  condition: Extract<Condition, { kind: "pattern" }>;
  strategyTimeframe: Timeframe;
  onChange: (condition: Condition) => void;
}) {
  const geometric = (GEOMETRIC_PATTERNS as string[]).includes(
    condition.pattern,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={condition.pattern}
          onValueChange={(p: Pattern) => onChange({ ...condition, pattern: p })}
        >
          <SelectTrigger className="w-64" aria-label="Pattern">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Market structure</SelectLabel>
              {STRUCTURE_PATTERNS.map((p) => (
                <SelectItem key={p} value={p}>
                  {PATTERN_WORDS[p].label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Chart shapes</SelectLabel>
              {GEOMETRIC_PATTERNS.map((p) => (
                <SelectItem key={p} value={p}>
                  {PATTERN_WORDS[p].label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select
          value={condition.timeframe ?? SAME_TF}
          onValueChange={(v) =>
            onChange({
              ...condition,
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
      </div>

      {/* What this pattern actually means — a name teaches nobody. */}
      <p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
        {PATTERN_WORDS[condition.pattern].meaning}
      </p>

      {/* Geometry is a matter of degree. Structure either happened or it did not. */}
      {geometric && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">
              How cleanly formed must it be?
            </span>
            <span className="font-numeric text-xs font-medium">
              {Math.round(condition.minQuality * 100)}%
            </span>
          </div>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[condition.minQuality * 100]}
            onValueChange={([v]) =>
              onChange({ ...condition, minQuality: v / 100 })
            }
            aria-label="Minimum pattern quality"
          />
          <p className="text-xs text-muted-foreground">
            A half-formed wedge is a Rorschach test, not a trade. Raise this to
            demand a cleaner shape.
          </p>
        </div>
      )}
    </div>
  );
}

function ComparisonEditor({
  condition,
  strategyTimeframe,
  onChange,
}: {
  condition: ComparisonCondition;
  strategyTimeframe: Timeframe;
  onChange: (condition: Condition) => void;
}) {
  const barCount = (BAR_COUNT_OPERATORS as string[]).includes(condition.op);
  const rightIsNumber = condition.right.kind === "number";

  return (
    <div className="space-y-2">
      <OperandEditor
        operand={condition.left}
        strategyTimeframe={strategyTimeframe}
        onChange={(left) => onChange({ ...condition, left })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={condition.op}
          onValueChange={(op: Operator) =>
            onChange({
              ...condition,
              op,
              // "rising for N bars" always takes a bar count on the right.
              right: (BAR_COUNT_OPERATORS as string[]).includes(op)
                ? { kind: "number", value: 3 }
                : condition.right,
            })
          }
        >
          <SelectTrigger className="w-56" aria-label="Comparison">
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

        {barCount ? (
          <>
            <Input
              type="number"
              min={1}
              value={
                condition.right.kind === "number" ? condition.right.value : 3
              }
              onChange={(e) =>
                onChange({
                  ...condition,
                  right: {
                    kind: "number",
                    value: Math.max(1, Number(e.target.value)),
                  },
                })
              }
              className="w-20 font-numeric"
              aria-label="Bars"
            />
            <span className="text-xs text-muted-foreground">bars</span>
          </>
        ) : (
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
        )}
      </div>

      {!barCount && (
        <OperandEditor
          operand={condition.right}
          strategyTimeframe={strategyTimeframe}
          onChange={(right) => onChange({ ...condition, right })}
        />
      )}
    </div>
  );
}

function OperandEditor({
  operand,
  strategyTimeframe,
  onChange,
}: {
  operand: Operand;
  strategyTimeframe: Timeframe;
  onChange: (operand: Operand) => void;
}) {
  if (operand.kind === "number") {
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
        <SelectTrigger className="w-56" aria-label="Indicator">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INDICATOR_GROUPS.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.items.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectGroup>
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

      {/* How "volume ≥ 1.5× its average" gets said at all */}
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
