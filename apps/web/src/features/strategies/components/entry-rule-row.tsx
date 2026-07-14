"use client";

import { Plus, X } from "lucide-react";
import type { Condition, EntryRule, Rule, Timeframe } from "@aegis/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConditionRow } from "./condition-row";

/**
 * One entry rule, editable.
 *
 * ── This component is the reason the document language stops where it does ──
 *
 * A strategy is a document, and a user-created one takes the identical code path as a
 * built-in (ADR-023). That promise only survives while **the editor can express
 * everything the evaluator can read**. The moment the evaluator understands logic this
 * component cannot render, built-in strategies get powers user strategies do not — and
 * a user opening a built-in would have its rules silently flattened by the very act of
 * looking at them.
 *
 * So the entry language is exactly this: a rule, or a group where any one will do. It
 * is what fits on a screen a trader can read, and that constraint is a feature.
 */
export function EntryRuleRow({
  rule,
  strategyTimeframe,
  onChange,
  onRemove,
}: {
  rule: EntryRule;
  strategyTimeframe: Timeframe;
  onChange: (rule: EntryRule) => void;
  onRemove?: () => void;
}) {
  /* ── A single condition ──────────────────────────────────────────── */

  if (rule.kind === "rule") {
    return (
      <div className="space-y-1.5">
        <ConditionRow
          condition={rule.condition}
          strategyTimeframe={strategyTimeframe}
          onChange={(condition) => onChange({ ...rule, condition })}
          onRemove={onRemove}
        />

        <label className="flex w-fit cursor-pointer items-center gap-2 pl-1 text-xs text-muted-foreground">
          <Checkbox
            checked={rule.negate}
            onCheckedChange={(checked) =>
              onChange({ ...rule, negate: checked === true })
            }
          />
          {/*
            "NOT" is a checkbox rather than a node in a tree. It says the same thing,
            it cannot be nested wrongly, and a trader can see it at a glance.
          */}
          Must NOT be true
        </label>
      </div>
    );
  }

  /* ── ANY of these ────────────────────────────────────────────────── */

  const update = (index: number, condition: Condition) =>
    onChange({
      ...rule,
      rules: rule.rules.map((r, i) => (i === index ? { ...r, condition } : r)),
    });

  const add = () =>
    onChange({
      ...rule,
      rules: [...rule.rules, blankRule()],
    });

  const removeAt = (index: number) => {
    const remaining = rule.rules.filter((_, i) => i !== index);

    /*
     * A group of one is not a choice. Collapse it back into a plain rule rather than
     * leaving an "ANY OF" with a single option, which would read as a group and behave
     * as a condition — and the schema refuses it anyway (`min(2)`).
     */
    if (remaining.length === 1) {
      onChange(remaining[0]);
      return;
    }

    onChange({ ...rule, rules: remaining });
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          Any ONE of these
        </span>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={add}>
            <Plus className="size-3.5" /> Option
          </Button>

          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label="Remove this group"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {rule.rules.map((r, index) => (
          <ConditionRow
            key={index}
            condition={r.condition}
            strategyTimeframe={strategyTimeframe}
            onChange={(condition) => update(index, condition)}
            onRemove={rule.rules.length > 2 ? () => removeAt(index) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/** A fresh rule. RSI below 30 — the most common thing a trader reaches for. */
export function blankRule(): Rule {
  return {
    kind: "rule",
    negate: false,
    condition: {
      kind: "comparison",
      left: { kind: "indicator", indicator: "rsi", period: 14 },
      op: "lt",
      right: { kind: "number", value: 30 },
    },
  };
}

/** A fresh ANY-OF group. Two options, because a one-option choice is not one. */
export function blankGroup(): EntryRule {
  return { kind: "any_of", rules: [blankRule(), blankRule()] };
}
