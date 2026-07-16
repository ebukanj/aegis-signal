"use client";

import { BotOff, MessagesSquare, TriangleAlert } from "lucide-react";
import type { SocialSignal } from "@aegis/contracts";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Social chatter — and, far more usefully, whether it is real.
 *
 * The mention count is the least interesting number here. **The astroturf ratio
 * is the one that saves you money.** It is the share of a spike coming from
 * accounts younger than 90 days or posting more than 50 times a day. Above 40%,
 * the platform treats the crowd as manufactured and blocks any signal built on
 * it.
 *
 * This matters because a pump needs a crowd, and a *manufactured* crowd is
 * precisely how retail gets used as exit liquidity. A feed that shows you
 * "PEPE mentions +510%!" without telling you that two thirds of those accounts
 * are three weeks old is not informing you — it is helping someone sell to you.
 */

/** Above this, the crowd is treated as manufactured and signals are blocked. */
const ASTROTURF_BLOCK_THRESHOLD = 40;

export function SocialFeed({ social }: { social: SocialSignal[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Social</h2>
        <p className="text-xs text-muted-foreground">
          Who is talking matters more than how many.
        </p>
      </div>

      {social.length === 0 && (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Nothing to show.</span>{" "}
            The platform polls Reddit&apos;s crypto communities every half hour; a
            coin enters this feed only when a real conversation forms (3+ posts).
            When the source is quiet — or unreachable from this network — this
            stays empty rather than inventing chatter.
          </p>
        </Card>
      )}

      <div className="space-y-2">
        {social.map((item) => {
          const manufactured = item.astroturfRatio > ASTROTURF_BLOCK_THRESHOLD;
          const bullish = item.sentiment > 0;

          return (
            <Card
              key={item.id}
              className={cn(
                "gap-2 p-4",
                manufactured && "border-destructive/40 bg-destructive/[0.03]",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide">
                  {item.coin}
                </span>

                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MessagesSquare className="size-3" aria-hidden />
                  <span className="font-numeric">
                    {item.mentionZScore.toFixed(1)}σ
                  </span>{" "}
                  above normal
                </span>

                <span
                  className={cn(
                    "ml-auto text-[10px] font-semibold uppercase tracking-wide",
                    bullish ? "text-success" : "text-destructive",
                  )}
                >
                  {bullish ? "Positive" : "Negative"} sentiment
                </span>
              </div>

              <p className="text-sm leading-relaxed text-muted-foreground">
                {item.topNarrative}
              </p>

              {/* The number that actually protects you */}
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                  manufactured
                    ? "border-destructive/40 text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {manufactured ? (
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                ) : (
                  <BotOff className="size-3.5 shrink-0" aria-hidden />
                )}
                <span>
                  <span className="font-numeric font-medium">
                    {item.astroturfRatio}%
                  </span>{" "}
                  bot / new accounts
                  {manufactured ? (
                    <>
                      {" "}
                      — <span className="font-medium">manufactured crowd.</span>{" "}
                      Signals built on this are blocked. Someone is trying to sell
                      to you.
                    </>
                  ) : (
                    <> — real people, below the 40% block threshold.</>
                  )}
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                {item.corroborated
                  ? "Corroborated by independent credible accounts"
                  : "Single-source — not corroborated"}{" "}
                · {formatRelativeTime(item.at)}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
