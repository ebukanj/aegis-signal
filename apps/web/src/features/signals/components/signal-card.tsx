"use client";

import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ConfidenceBadge } from "@/components/shared/confidence-badge";
import { DirectionBadge } from "@/components/shared/direction-badge";
import { RISK_META } from "@/constants/domain";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatPrice, formatSignalTime } from "@/lib/format";
import { buildTradeInstruction } from "@/lib/trade-instruction";
import { cn } from "@/lib/utils";
import { LivePrice } from "@/features/signals/components/live-price";
import type { Opportunity } from "@/features/scanner/types";

/**
 * One signal, as a card.
 *
 * There are only ever a handful of these, so they get room to breathe rather
 * than being crushed into a table. The card answers the four questions the
 * platform exists to answer (AGENTS.md §1):
 *
 *   what to trade   →  pair + direction
 *   how to take it  →  the trade instruction sentence + entry/stop/targets
 *   why             →  the strategies that agreed, and the confidence
 *   what kills it   →  the stop
 */
export function SignalCard({
  signal,
  onSelect,
}: {
  signal: Opportunity;
  onSelect: (signal: Opportunity) => void;
}) {
  const risk = RISK_META[signal.riskLevel];
  const instruction = buildTradeInstruction(signal);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(signal)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(signal);
        }
      }}
      aria-label={`${signal.direction} ${signal.pair}, confidence ${signal.confidence}. Open details.`}
      className={cn(
        "group cursor-pointer gap-4 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 focus-visible:border-primary/60 focus-visible:outline-none",
        signal.isPrime &&
          "prime-signal border-primary/30 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent",
      )}
    >
      {/* Identity */}
      <div className="flex flex-wrap items-center gap-2">
        {signal.isPrime && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="size-3" aria-hidden />
            Prime
          </span>
        )}
        <span className="text-base font-semibold tracking-tight">
          {signal.pair}
        </span>
        <DirectionBadge direction={signal.direction} />
        {/* The timeframe is what tells you whether this is a scalp or a swing —
            the same strategy on the 15m and the 4h are different trades. */}
        <span className="rounded-md border px-1.5 py-0.5 font-numeric text-[10px] text-muted-foreground">
          {signal.timeframe}
        </span>
        <span className="text-xs text-muted-foreground">{signal.exchange}</span>

        <div className="ml-auto flex items-center gap-2">
          <StatusBadge status={risk.status}>{risk.label} risk</StatusBadge>
          <ConfidenceBadge score={signal.confidence} />
        </div>
      </div>

      {/* Is this trade still there? The entry we published goes stale the
          moment price moves away from it. */}
      <LivePrice signal={signal} />

      {/* The instruction — the thing a trader actually executes */}
      <p className="text-sm leading-relaxed">{instruction}</p>

      {/* The numbers */}
      <dl className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <div>
          <dt className="label-caps text-muted-foreground">Entry</dt>
          <dd className="mt-0.5 font-numeric font-medium">
            {formatPrice(signal.entryPrice)}
          </dd>
        </div>
        <div>
          <dt className="label-caps text-muted-foreground">Stop</dt>
          <dd className="mt-0.5 font-numeric font-medium text-destructive">
            {formatPrice(signal.stopLoss)}
          </dd>
        </div>
        <div>
          <dt className="label-caps text-muted-foreground">Target</dt>
          <dd className="mt-0.5 font-numeric font-medium text-success">
            {formatPrice(signal.takeProfit)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {signal.rewardRisk}R
            </span>
          </dd>
        </div>
      </dl>

      {/* Why it exists */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {signal.strategies.length > 1 ? (
            <>
              <span className="font-medium text-foreground">
                {signal.strategies.length} strategies agreed
              </span>{" "}
              — {signal.strategies.join(", ")}
            </>
          ) : (
            <>
              Found by{" "}
              <span className="font-medium text-foreground">
                {signal.strategies[0]}
              </span>
            </>
          )}
        </span>
        {/* The exact clock time. A signal is a time-critical instruction — "2h
            ago" does not tell a trader whether they are early or too late. */}
        <span className="ml-auto font-numeric">
          {formatSignalTime(signal.generatedAt)}
        </span>
      </div>
    </Card>
  );
}
