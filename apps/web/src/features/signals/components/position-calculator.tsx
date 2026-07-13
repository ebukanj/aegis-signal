"use client";

import { useState } from "react";
import { Calculator, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Opportunity } from "@/features/scanner/types";
import type { RiskLevel } from "@/types/domain";

/**
 * Position sizing, liquidation, and how much to actually risk.
 *
 * Pre-filled from this signal's own entry and stop, because "how much do I put
 * on this?" is part of *here is exactly how to take it* (AGENTS.md §1). A signal
 * that tells you where to enter but not how much to risk is half an answer.
 *
 * Two things here exist purely to protect the trader:
 *
 *   1. THE LIQUIDATION WARNING. If leverage is high enough that the exchange
 *      liquidates you BEFORE your stop is hit, the stop is decoration — you are
 *      wiped out before the trade is even proven wrong. The calculator detects
 *      this and names the highest leverage that keeps liquidation behind the
 *      stop. This is the single most expensive mistake in leveraged trading.
 *
 *   2. SUGGESTED RISK, SCALED TO CONFIDENCE. Not every signal deserves the same
 *      size. A 92-confidence setup and a 76-confidence setup are not the same
 *      bet, and betting them the same is how an edge gets given back.
 *
 * Sizing rule (06-STRATEGIES §6):  Size = (Equity × Risk%) / |Entry − Stop|
 * Risk is defined by the stop. Leverage only changes the margin you post.
 */

/** Exchange maintenance margin. Real value is per-venue; this is a safe stand-in. */
const MAINTENANCE_MARGIN = 0.005;

/**
 * What the platform thinks you should risk here.
 * Higher conviction earns a bigger bet — but risk level caps it, always.
 */
function suggestRiskPercent(confidence: number, riskLevel: RiskLevel): number {
  const byConfidence =
    confidence >= 90 ? 1.5 : confidence >= 80 ? 1.0 : confidence >= 75 ? 0.5 : 0.25;

  const cap: Record<RiskLevel, number> = {
    LOW: 2.0,
    MODERATE: 1.5,
    ELEVATED: 1.0,
    HIGH: 0.5,
  };

  return Math.min(byConfidence, cap[riskLevel]);
}

export function PositionCalculator({ signal }: { signal: Opportunity }) {
  const suggested = suggestRiskPercent(signal.confidence, signal.riskLevel);

  const [equity, setEquity] = useState(10_000);
  const [riskPercent, setRiskPercent] = useState(suggested);
  const [leverage, setLeverage] = useState(signal.suggestedLeverage ?? 1);

  const isPerp = signal.marketType === "PERPETUAL";
  const isLong = signal.direction === "LONG";

  const stopDistance = Math.abs(signal.entryPrice - signal.stopLoss);
  const stopPercent = stopDistance / signal.entryPrice;

  const riskAmount = (equity * riskPercent) / 100;
  const units = stopDistance > 0 ? riskAmount / stopDistance : 0;
  const notional = units * signal.entryPrice;
  const margin = isPerp && leverage > 0 ? notional / leverage : notional;
  const rewardAmount = riskAmount * signal.rewardRisk;

  // Liquidation (isolated margin, simplified — the exchange is authoritative).
  const liquidation = isLong
    ? signal.entryPrice * (1 - 1 / leverage + MAINTENANCE_MARGIN)
    : signal.entryPrice * (1 + 1 / leverage - MAINTENANCE_MARGIN);

  // Does the exchange kill you before your stop does?
  const liquidationBeforeStop = isLong
    ? liquidation >= signal.stopLoss
    : liquidation <= signal.stopLoss;

  /** Highest leverage that keeps liquidation a comfortable margin past the stop. */
  const safeLeverage = Math.max(
    1,
    Math.floor(1 / (1.5 * stopPercent + MAINTENANCE_MARGIN)),
  );

  return (
    <Card className="gap-4 p-4">
      <div className="flex items-center gap-2">
        <Calculator className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-sm font-semibold tracking-tight">
          Position &amp; risk
        </h3>
      </div>

      {/* Suggested risk — the platform's opinion, and why */}
      <div className="rounded-md border border-primary/25 bg-primary/[0.04] px-3 py-2 text-xs">
        <p>
          <span className="font-medium text-primary">
            Suggested risk: {suggested}%
          </span>{" "}
          <span className="text-muted-foreground">
            — confidence {signal.confidence}, {signal.riskLevel.toLowerCase()}{" "}
            risk. Higher conviction earns a bigger bet; the risk level caps it.
          </span>
        </p>
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

      {isPerp && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="calc-lev" className="text-xs">
              Leverage
            </Label>
            <span
              className={cn(
                "font-numeric text-sm font-medium",
                liquidationBeforeStop && "text-destructive",
              )}
            >
              {leverage}×
            </span>
          </div>
          <Slider
            id="calc-lev"
            min={1}
            max={25}
            step={1}
            value={[leverage]}
            onValueChange={([v]) => setLeverage(v)}
            aria-label="Leverage"
          />
        </div>
      )}

      {/* The warning that saves accounts */}
      {isPerp && liquidationBeforeStop && (
        <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <div className="space-y-1 text-xs">
            <p className="font-semibold text-destructive">
              You would be liquidated before your stop is hit.
            </p>
            <p className="text-muted-foreground">
              At {leverage}× the exchange closes you at{" "}
              <span className="font-numeric font-medium text-foreground">
                {formatPrice(liquidation)}
              </span>
              , which price reaches{" "}
              <span className="font-medium">before</span> your stop at{" "}
              <span className="font-numeric font-medium text-foreground">
                {formatPrice(signal.stopLoss)}
              </span>
              . Your stop would never trigger — you would simply be wiped out.
            </p>
            <button
              type="button"
              onClick={() => setLeverage(safeLeverage)}
              className="font-medium text-destructive underline underline-offset-2"
            >
              Use {safeLeverage}× instead
            </button>
          </div>
        </div>
      )}

      <dl className="space-y-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
        <Row
          label="You risk"
          value={formatPrice(riskAmount)}
          hint={`stop is ${(stopPercent * 100).toFixed(2)}% away`}
          tone="risk"
        />
        <Row
          label="Position size"
          value={`${units.toFixed(4)} ${signal.coin}`}
          hint={formatPrice(notional)}
        />
        {isPerp && (
          <>
            <Row label={`Margin at ${leverage}×`} value={formatPrice(margin)} />
            <Row
              label="Liquidation"
              value={formatPrice(liquidation)}
              hint={liquidationBeforeStop ? "before your stop" : "safely past your stop"}
              tone={liquidationBeforeStop ? "risk" : undefined}
            />
          </>
        )}
        <Row
          label="If target hits"
          value={`+${formatPrice(rewardAmount)}`}
          hint={`${signal.rewardRisk}R`}
          tone="reward"
        />
      </dl>

      <p className="text-xs text-muted-foreground">
        Sized from the stop, never from the leverage. Liquidation is an estimate —
        your exchange&apos;s margin rules are the authority. Not financial advice.
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
          className={cn(
            "font-numeric font-medium",
            tone === "risk" && "text-destructive",
            tone === "reward" && "text-success",
          )}
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
