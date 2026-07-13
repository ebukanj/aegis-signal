"use client";

import { useState } from "react";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  describeCondition,
  strategyDefinitionSchema,
} from "@aegis/contracts";
import type {
  Condition,
  Indicator,
  Operator,
  StrategyDefinition,
} from "@aegis/contracts";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The strategy builder.
 *
 * A user authors a strategy by *filling in a form*, never by writing code
 * (ADR-023). The closed vocabulary below is what makes that safe: every
 * strategy anyone can express is deterministic by construction, so there is no
 * sandbox to escape and no arbitrary code to execute — and the backend runs a
 * user's rule through exactly the same evaluator as a built-in one.
 *
 * Every edit is validated against the contract schema before it can be saved,
 * so an impossible strategy (a SHORT on spot, targets closing 140% of the
 * position, a leverage cap on a spot rule) cannot be created at all.
 */

const INDICATORS: { value: Indicator; label: string }[] = [
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
  { value: "bb_lower", label: "Lower Bollinger Band" },
  { value: "highest_high", label: "Highest high" },
  { value: "lowest_low", label: "Lowest low" },
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

const NEEDS_PERIOD = new Set<Indicator>([
  "ema", "sma", "rsi", "adx", "atr", "bb_upper", "bb_lower",
  "highest_high", "lowest_low", "zscore", "volume_sma",
]);

function blankCondition(): Condition {
  return {
    left: { kind: "indicator", indicator: "rsi", period: 14 },
    op: "lt",
    right: { kind: "number", value: 30 },
  };
}

export function StrategyEditor({
  strategy,
  onSave,
  onClose,
}: {
  strategy: StrategyDefinition | null;
  onSave: (strategy: StrategyDefinition) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={strategy !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-xl"
      >
        {strategy && (
          <EditorBody
            key={strategy.id}
            strategy={strategy}
            onSave={onSave}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditorBody({
  strategy,
  onSave,
}: {
  strategy: StrategyDefinition;
  onSave: (strategy: StrategyDefinition) => void;
}) {
  const [draft, setDraft] = useState<StrategyDefinition>(strategy);
  const [errors, setErrors] = useState<string[]>([]);

  const patch = (changes: Partial<StrategyDefinition>) =>
    setDraft((d) => ({ ...d, ...changes }) as StrategyDefinition);

  const setCondition = (index: number, condition: Condition) =>
    setDraft((d) => ({
      ...d,
      entry: d.entry.map((c, i) => (i === index ? condition : c)),
    }));

  const save = () => {
    // The contract is the gate. An impossible strategy cannot be saved.
    const result = strategyDefinitionSchema.safeParse(draft);
    if (!result.success) {
      setErrors(result.error.issues.map((i) => i.message));
      return;
    }
    setErrors([]);
    onSave(result.data);
  };

  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle>
          {strategy.origin === "CUSTOM" && strategy.entry.length === 1
            ? "New strategy"
            : `Edit ${strategy.name}`}
        </SheetTitle>
        <SheetDescription>
          Build the rule by filling this in. No code — and anything you can
          express here, the platform can run.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 p-4">
        {/* Identity */}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="s-name">Name</Label>
            <Input
              id="s-name"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Oversold Bounce"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-summary">What does it look for?</Label>
            <Textarea
              id="s-summary"
              rows={2}
              value={draft.summary}
              onChange={(e) => patch({ summary: e.target.value })}
              placeholder="One sentence a trader understands without a manual."
            />
          </div>
        </div>

        {/* Market */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Side">
            <Select
              value={draft.direction}
              onValueChange={(v: StrategyDefinition["direction"]) =>
                patch({ direction: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LONG">Long only</SelectItem>
                <SelectItem value="SHORT">Short only</SelectItem>
                <SelectItem value="BOTH">Both</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Market">
            <Select
              value={draft.market}
              onValueChange={(v: StrategyDefinition["market"]) =>
                patch({
                  market: v,
                  // The contract forbids leverage on spot — keep the draft legal.
                  maxLeverage: v === "SPOT" ? null : (draft.maxLeverage ?? 3),
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SPOT">Spot</SelectItem>
                <SelectItem value="PERPETUAL">Perpetual</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Timeframe">
            <Select
              value={draft.timeframe}
              onValueChange={(v: StrategyDefinition["timeframe"]) =>
                patch({ timeframe: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["15m", "1h", "4h", "1d"] as const).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Entry conditions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Enter when ALL of these are true</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch({ entry: [...draft.entry, blankCondition()] })
              }
            >
              <Plus /> Add condition
            </Button>
          </div>

          <div className="space-y-2">
            {draft.entry.map((condition, index) => (
              <ConditionRow
                key={index}
                condition={condition}
                onChange={(c) => setCondition(index, c)}
                onRemove={
                  draft.entry.length > 1
                    ? () =>
                        patch({
                          entry: draft.entry.filter((_, i) => i !== index),
                        })
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        {/* Risk */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Risk per trade (%)">
            <Input
              type="number"
              min={0.1}
              max={5}
              step={0.25}
              value={draft.riskPercent}
              onChange={(e) =>
                patch({ riskPercent: Number(e.target.value) })
              }
              className="font-numeric"
            />
          </Field>

          {draft.market === "PERPETUAL" && (
            <Field label="Max leverage">
              <Input
                type="number"
                min={1}
                max={25}
                value={draft.maxLeverage ?? 3}
                onChange={(e) =>
                  patch({ maxLeverage: Number(e.target.value) })
                }
                className="font-numeric"
              />
            </Field>
          )}
        </div>

        {/* The contract's verdict */}
        {errors.length > 0 && (
          <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5">
            <TriangleAlert
              className="mt-0.5 size-4 shrink-0 text-destructive"
              aria-hidden
            />
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-destructive">
                This strategy cannot run as written.
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {errors.map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="rounded-md border border-dashed px-3 py-2">
          <p className="text-xs text-muted-foreground">
            A new or edited strategy starts <strong>unproven</strong>. It will
            produce signals, but it cannot enter today&apos;s few until it has
            earned a track record.
          </p>
        </div>

        <Button onClick={save} className="w-full" size="lg">
          Save strategy
        </Button>
      </div>
    </>
  );
}

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onRemove?: () => void;
}) {
  const left = condition.left;
  const right = condition.right;

  const leftIndicator =
    left.kind === "indicator" ? left.indicator : "close";
  const leftPeriod = left.kind === "indicator" ? left.period : undefined;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={leftIndicator}
          onValueChange={(v: Indicator) =>
            onChange({
              ...condition,
              left: {
                kind: "indicator",
                indicator: v,
                period: NEEDS_PERIOD.has(v) ? (leftPeriod ?? 14) : undefined,
              },
            })
          }
        >
          <SelectTrigger className="w-44">
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

        {NEEDS_PERIOD.has(leftIndicator) && (
          <Input
            type="number"
            min={1}
            value={leftPeriod ?? 14}
            onChange={(e) =>
              onChange({
                ...condition,
                left: {
                  kind: "indicator",
                  indicator: leftIndicator,
                  period: Math.max(1, Number(e.target.value)),
                },
              })
            }
            className="w-20 font-numeric"
            aria-label="Period"
          />
        )}

        <Select
          value={condition.op}
          onValueChange={(v: Operator) => onChange({ ...condition, op: v })}
        >
          <SelectTrigger className="w-36">
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

        <Input
          type="number"
          step="any"
          value={right.kind === "number" ? right.value : 0}
          onChange={(e) =>
            onChange({
              ...condition,
              right: { kind: "number", value: Number(e.target.value) },
            })
          }
          className="w-24 font-numeric"
          aria-label="Value"
        />

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

      {/* The rule, read back in plain English — the same renderer the card uses */}
      <p className="text-xs text-muted-foreground">
        {describeCondition(condition)}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
