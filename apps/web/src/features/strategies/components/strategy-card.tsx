"use client";

import { useState } from "react";
import { ChevronDown, Copy, Pencil, Trash2 } from "lucide-react";
import { describeStrategy, isProven } from "@aegis/contracts";
import type { StrategyDefinition } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One strategy, briefly.
 *
 * The old page had a health radar, a compatibility matrix, a correlation
 * heatmap, a comparison modal and a "compare" checkbox nobody could explain.
 * None of it told you the two things that actually matter:
 *
 *   1. What does this rule look for?   → the summary, and the rules on demand
 *   2. Has it made money?              → three numbers, or the honest UNPROVEN
 *
 * Plus the thing that was missing entirely: a way to switch it off.
 */
export function StrategyCard({
  strategy,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  strategy: StrategyDefinition;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [showRules, setShowRules] = useState(false);
  const proven = isProven(strategy);
  const rules = describeStrategy(strategy);
  const custom = strategy.origin === "CUSTOM";

  return (
    <Card className={cn("gap-4 p-5", !strategy.enabled && "bg-muted/30")}>
      {/* Identity + the switch */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight">
              {strategy.name}
            </h3>
            {custom && (
              <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Custom
              </span>
            )}
          </div>
          <p className="text-sm leading-snug text-muted-foreground">
            {strategy.summary}
          </p>
        </div>

        <Switch
          checked={strategy.enabled}
          onCheckedChange={onToggle}
          aria-label={`${strategy.enabled ? "Disable" : "Enable"} ${strategy.name}`}
        />
      </div>

      {/* Has it made money? */}
      {proven && strategy.record ? (
        <dl className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <Stat label="Signals" value={String(strategy.record.signals)} />
          <Stat
            label="Won"
            value={`${Math.round(
              (strategy.record.wins / strategy.record.signals) * 100,
            )}%`}
          />
          <Stat
            label="Expectancy"
            value={`${strategy.record.expectancy > 0 ? "+" : ""}${strategy.record.expectancy}R`}
            tone={strategy.record.expectancy >= 0 ? "success" : "danger"}
          />
        </dl>
      ) : (
        <div className="rounded-md border border-dashed px-3 py-2">
          <p className="text-xs font-medium">Unproven — no track record yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            It can produce signals, but it cannot enter today&apos;s few until it
            has earned a record.
          </p>
        </div>
      )}

      {/* The rules, on demand */}
      <div>
        <button
          type="button"
          onClick={() => setShowRules((v) => !v)}
          aria-expanded={showRules}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", showRules && "rotate-180")}
            aria-hidden
          />
          {showRules ? "Hide rules" : "View rules"}
        </button>

        {showRules && (
          <div className="mt-3 space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
            <div>
              <p className="text-xs font-medium">{rules.headline}</p>
              <ul className="mt-1.5 space-y-1">
                {rules.entry.map((line) => (
                  <li key={line} className="flex gap-2 text-muted-foreground">
                    <span aria-hidden>·</span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            {rules.filters.length > 0 && (
              <div>
                <p className="label-caps text-muted-foreground">Only if</p>
                <ul className="mt-1 space-y-1">
                  {rules.filters.map((line) => (
                    <li key={line} className="flex gap-2 text-muted-foreground">
                      <span aria-hidden>·</span>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="label-caps text-muted-foreground">Stop</p>
                <p className="mt-0.5 text-muted-foreground">{rules.stop}</p>
              </div>
              <div>
                <p className="label-caps text-muted-foreground">Targets</p>
                <p className="mt-0.5 text-muted-foreground">
                  {rules.targets.join(" · ")}
                </p>
              </div>
            </div>

            <p className="border-t pt-2 text-xs text-muted-foreground">
              {rules.risk}
            </p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil /> Edit
        </Button>
        <Button variant="ghost" size="sm" onClick={onDuplicate}>
          <Copy /> Duplicate
        </Button>
        {custom && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="ml-auto text-destructive hover:text-destructive"
          >
            <Trash2 /> Delete
          </Button>
        )}
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div>
      <dt className="label-caps text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 font-numeric font-medium",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
