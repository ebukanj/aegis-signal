"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { StrategyDefinition } from "@aegis/contracts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StrategyCard } from "@/features/strategies/components/strategy-card";
import { StrategyEditor } from "@/features/strategies/components/strategy-editor";
import { useStrategyStore } from "@/features/strategies/stores/strategy-store";

/**
 * Strategies — the rules that produce your signals.
 *
 * What this page used to be: overview cards, a search box, a status filter, a
 * sort control, a compare modal, a health radar, a compatibility matrix, a
 * correlation heatmap, performance analytics and an AI insight panel. None of
 * it answered the two questions a trader actually has.
 *
 * What it is now: one card per strategy — what it looks for, whether it has
 * made money, its rules on demand, and a switch. Plus the thing that was
 * missing entirely: the ability to create your own.
 */
export function StrategiesPage() {
  const { strategies, toggle, upsert, remove, duplicate } = useStrategyStore();
  const [editing, setEditing] = useState<StrategyDefinition | null>(null);

  const createNew = () =>
    setEditing({
      id: `custom-${Date.now().toString(36)}`,
      name: "",
      summary: "",
      origin: "CUSTOM",
      enabled: false,
      direction: "LONG",
      market: "PERPETUAL",
      timeframe: "1h",
      entry: [
        {
          left: { kind: "indicator", indicator: "rsi", period: 14 },
          op: "lt",
          right: { kind: "number", value: 30 },
        },
      ],
      filters: [],
      stop: { kind: "atr", period: 14, multiplier: 1.5 },
      targets: [{ rMultiple: 2, closePercent: 100 }],
      riskPercent: 1,
      maxLeverage: 3,
      riskLevel: "MODERATE",
      record: null,
    });

  const save = (strategy: StrategyDefinition) => {
    upsert(strategy);
    setEditing(null);
    toast.success(`${strategy.name} saved`, {
      description: strategy.enabled
        ? "It will be included in the next scan."
        : "Switch it on to include it in the scan.",
    });
  };

  const enabled = strategies.filter((s) => s.enabled).length;

  return (
    <div className="flex flex-col gap-5 pb-16">
      <PageHeader
        title="Strategies"
        description="The rules that produce your signals. Switch them on or off, change them, or write your own."
        actions={
          <Button onClick={createNew}>
            <Plus /> Create strategy
          </Button>
        }
      />

      <p className="text-sm text-muted-foreground">
        <span className="font-numeric font-medium text-foreground">
          {enabled}
        </span>{" "}
        of{" "}
        <span className="font-numeric font-medium text-foreground">
          {strategies.length}
        </span>{" "}
        switched on. Only these hunt for your signals.
      </p>

      <div className="grid gap-4 xl:grid-cols-2">
        {strategies.map((strategy) => (
          <StrategyCard
            key={strategy.id}
            strategy={strategy}
            onToggle={() => toggle(strategy.id)}
            onEdit={() => setEditing(strategy)}
            onDuplicate={() => {
              duplicate(strategy.id);
              toast.success(`${strategy.name} duplicated`, {
                description: "The copy starts switched off and unproven.",
              });
            }}
            onDelete={() => {
              remove(strategy.id);
              toast.success(`${strategy.name} deleted`);
            }}
          />
        ))}
      </div>

      <StrategyEditor
        strategy={editing}
        onSave={save}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
