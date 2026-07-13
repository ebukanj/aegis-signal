"use client";

import type { NewsImpact, NewsItem, SourceTier } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * News that moves coins.
 *
 * Two columns do the real work here and most news feeds have neither:
 *
 *   TIER — how much the source is worth. An official announcement and an
 *   anonymous account are not the same evidence, and presenting them alike is
 *   how traders get farmed.
 *
 *   COINS — which assets the story actually concerns. A headline that names no
 *   coin is market context; a headline that names one is a reason to look at it.
 *
 * A story is never a reason to buy. It is a reason to *look* — the chart still
 * has to agree (Founding Principle 9).
 */

const IMPACT_META: Record<NewsImpact, { label: string; tone: string }> = {
  BULLISH: { label: "Bullish", tone: "text-success" },
  BEARISH: { label: "Bearish", tone: "text-destructive" },
  NEUTRAL: { label: "Neutral", tone: "text-muted-foreground" },
};

const TIER_META: Record<SourceTier, { label: string; tone: string }> = {
  TIER_1: {
    label: "Tier 1",
    tone: "border-success/40 text-success",
  },
  TIER_2: { label: "Tier 2", tone: "text-muted-foreground" },
  TIER_3: {
    label: "Unverified",
    tone: "border-warning/40 text-warning",
  },
};

export function NewsFeed({ news }: { news: NewsItem[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-tight">News</h2>
        <p className="text-xs text-muted-foreground">
          A story is a reason to look, never a reason to buy.
        </p>
      </div>

      <div className="space-y-2">
        {news.map((item) => {
          const impact = IMPACT_META[item.impact];
          const tier = TIER_META[item.tier];

          return (
            <Card key={item.id} className="gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {item.coins.map((coin) => (
                  <span
                    key={coin}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
                  >
                    {coin}
                  </span>
                ))}
                {item.coins.length === 0 && (
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                    Market-wide
                  </span>
                )}

                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    tier.tone,
                  )}
                >
                  {tier.label}
                </span>

                <span
                  className={cn(
                    "ml-auto text-[10px] font-semibold uppercase tracking-wide",
                    impact.tone,
                  )}
                >
                  {impact.label}
                </span>
              </div>

              <p className="text-sm font-medium leading-snug">{item.headline}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.summary}
              </p>

              <p className="text-xs text-muted-foreground">
                {item.source} · {formatRelativeTime(item.publishedAt)}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
