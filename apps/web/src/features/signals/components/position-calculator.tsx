"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/format";
import type { Opportunity } from "@/features/scanner/types";

/**
 * Position sizing, pre-filled from this signal's own entry and stop.
 *
 * This is not a generic tool bolted on: "how much do I put on this trade?" is
 * part of *here is exactly how to take it* (AGENTS.md §1). A signal that tells
 * you where to enter but not how much to risk is only half an answer.
 *
 * The rule the whole platform sizes by (06-STRATEGIES §6):
 *
 *     PositionSize = (Equity × Risk%) / |Entry − Stop|
 *
 * Risk is defined by the stop distance. Leverage only decides margin
 * efficiency — it never decides risk.
 */
export function PositionCalculator({ signal }: { signal: Opportunity }) {
  const [equity, setEquity] = useState(10_000);
  const [riskPercent, setRiskPercent] = useState(1);

  const stopDistance = Math.abs(signal.entryPrice - signal.stopLoss);
  const riskAmount = (equity * riskPercent) / 100;
  const units = stopDistance > 0 ? riskAmount / stopDistance : 0;
  const notional = units * signal.entryPrice;
  const stopPercent = (stopDistance / signal.entryPrice) * 100;

  const marginRequired =
    signal.suggestedLeverage && signal.suggestedLeverage > 0
      ? notional / signal.suggestedLeverage
      : notional;

  const rewardAmount = riskAmount * signal.rewardRisk;

  return (
    <Card className="gap-4 p-4">
      <div className="flex items-center gap-2">
        <Calculator className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold tracking-tight">
          Position size
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="calc-equity" className="text-xs">
            Account equity
          </Label>
          <Input
            id="calc-equity"
            type="number"
            min={0}
            value={equity}
            onChange={(e) => setEquity(Math.max(0, Number(e.target.value)))}
            className="font-numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="calc-risk" className="text-xs">
            Risk per trade (%)
          </Label>
          <Input
            id="calc-risk"
            type="number"
            min={0.1}
            max={10}
            step={0.25}
            value={riskPercent}
            onChange={(e) =>
              setRiskPercent(Math.max(0.1, Number(e.target.value)))
            }
            className="font-numeric"
          />
        </div>
      </div>

      <dl className="space-y-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
        <Row
          label="You risk"
          value={formatPrice(riskAmount)}
          hint={`stop is ${stopPercent.toFixed(2)}% away`}
          tone="risk"
        />
        <Row
          label="Position size"
          value={`${units.toFixed(4)} ${signal.coin}`}
          hint={formatPrice(notional)}
        />
        {signal.marketType === "PERPETUAL" && signal.suggestedLeverage && (
          <Row
            label={`Margin at ${signal.suggestedLeverage}×`}
            value={formatPrice(marginRequired)}
          />
        )}
        <Row
          label="If target hits"
          value={`+${formatPrice(rewardAmount)}`}
          hint={`${signal.rewardRisk}R`}
          tone="reward"
        />
      </dl>

      <p className="text-xs text-muted-foreground">
        Sized from the stop, never from the leverage. Leverage only changes the
        margin you post — it does not change what you stand to lose.
      </p>
    </Card>
  );
}

function Row({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "risk" | "reward";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right">
        <span
          className={
            tone === "risk"
              ? "font-numeric font-medium text-destructive"
              : tone === "reward"
                ? "font-numeric font-medium text-success"
                : "font-numeric font-medium"
          }
        >
          {value}
        </span>
        {hint && (
          <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
        )}
      </dd>
    </div>
  );
}
