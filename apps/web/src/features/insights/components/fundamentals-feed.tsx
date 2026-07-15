"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { FundamentalKind, FundamentalSignal } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * What the money is actually doing, as opposed to what people are saying.
 *
 * The most valuable thing on this page is the contradiction: when social
 * sentiment is euphoric and whales are simultaneously sending coins TO
 * exchanges, that is a distribution signature — the crowd is being sold to. The
 * story says buy; the flows say the insiders are leaving.
 *
 * Every entry cites its measurement. "Whales are accumulating" is a vibe;
 * "−$18.4M netflow (24h)" is evidence.
 */

const KIND_LABEL: Record<FundamentalKind, string> = {
  EXCHANGE_OUTFLOW: "Leaving exchanges",
  EXCHANGE_INFLOW: "Arriving at exchanges",
  WHALE_ACCUMULATION: "Whale accumulation",
  WHALE_DISTRIBUTION: "Whale distribution",
  DEV_ACTIVITY: "Developer activity",
  TVL_CHANGE: "Value locked",
};

export function FundamentalsFeed({
  fundamentals,
}: {
  fundamentals: FundamentalSignal[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Fundamentals</h2>
        <p className="text-xs text-muted-foreground">
          What the money is doing, not what people are saying.
        </p>
      </div>

      {fundamentals.length === 0 && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            On-chain fundamentals are not live yet — whale flows and exchange
            netflows arrive in a later milestone. The platform shows nothing here
            rather than a fabricated figure.
          </p>
        </Card>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {fundamentals.map((item) => (
          <Card key={item.id} className="gap-2 p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
                {item.coin}
              </span>
              <span className="text-xs text-muted-foreground">
                {KIND_LABEL[item.kind]}
              </span>
              {item.bullish ? (
                <ArrowUpRight
                  className="ml-auto size-4 text-success"
                  aria-label="Bullish"
                />
              ) : (
                <ArrowDownRight
                  className="ml-auto size-4 text-destructive"
                  aria-label="Bearish"
                />
              )}
            </div>

            <p className="text-sm font-medium leading-snug">{item.headline}</p>

            <p
              className={cn(
                "font-numeric text-sm font-semibold",
                item.bullish ? "text-success" : "text-destructive",
              )}
            >
              {item.measured}
            </p>

            <p className="text-xs text-muted-foreground">
              {formatRelativeTime(item.at)}
            </p>
          </Card>
        ))}
      </div>
    </section>
  );
}
