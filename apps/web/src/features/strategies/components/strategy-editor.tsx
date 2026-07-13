"use client";

import { useState } from "react";
import { Plus, TriangleAlert } from "lucide-react";
import { strategyDefinitionSchema } from "@aegis/contracts";
import type { Condition, StrategyDefinition } from "@aegis/contracts";
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
import { ConditionRow } from "@/features/strategies/components/condition-row";

/**
 * The strategy builder.
 *
 * A user authors a strategy by *filling in a form*, never by writing code
 * (ADR-023). The closed vocabulary is what makes that safe: every strategy
 * anyone can express is deterministic by construction, so there is no sandbox
 * to escape — and the backend runs a user's rule through exactly the same
 * evaluator as a built-in one.
 *
 * Every edit is validated against the contract schema before it can be saved,
 * so an impossible strategy (a SHORT on spot, targets closing 140% of the
 * position, leverage on a spot rule) cannot be created at all.
 */

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
        className="w-full gap-0 overflow-y-auto sm:max-w-2xl"
      >
        {strategy && (
          <EditorBody key={strategy.id} strategy={strategy} onSave={onSave} />
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

  const setEntry = (index: number, condition: Condition) =>
    setDraft((d) => ({
      ...d,
      entry: d.entry.map((c, i) => (i === index ? condition : c)),
    }));

  const setFilter = (index: number, condition: Condition) =>
    setDraft((d) => ({
      ...d,
      filters: d.filters.map((c, i) => (i === index ? condition : c)),
    }));

  const isNew = strategy.name === "";

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
        <SheetTitle>{isNew ? "New strategy" : `Edit ${strategy.name}`}</SheetTitle>
        <SheetDescription>
          Build the rule by filling this in. No code — and anything you can
          express here, the platform can run.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 p-4">
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

          <Field label="Main timeframe">
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
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enter when ALL of these are true</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Each condition can read a different timeframe — that is how a{" "}
                {draft.timeframe} rule asks &ldquo;but is the 4h trend
                up?&rdquo;
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => patch({ entry: [...draft.entry, blankCondition()] })}
            >
              <Plus /> Add
            </Button>
          </div>

          <div className="space-y-2">
            {draft.entry.map((condition, index) => (
              <ConditionRow
                key={index}
                condition={condition}
                strategyTimeframe={draft.timeframe}
                onChange={(c) => setEntry(index, c)}
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
        </section>

        {/* Filters */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label>Only if… (optional)</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Extra gates — usually a higher-timeframe check.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                patch({ filters: [...draft.filters, blankCondition()] })
              }
            >
              <Plus /> Add
            </Button>
          </div>

          {draft.filters.length > 0 && (
            <div className="space-y-2">
              {draft.filters.map((condition, index) => (
                <ConditionRow
                  key={index}
                  condition={condition}
                  strategyTimeframe={draft.timeframe}
                  onChange={(c) => setFilter(index, c)}
                  onRemove={() =>
                    patch({
                      filters: draft.filters.filter((_, i) => i !== index),
                    })
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Risk */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Risk per trade (%)">
            <Input
              type="number"
              min={0.1}
              max={5}
              step={0.25}
              value={draft.riskPercent}
              onChange={(e) => patch({ riskPercent: Number(e.target.value) })}
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
                onChange={(e) => patch({ maxLeverage: Number(e.target.value) })}
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
