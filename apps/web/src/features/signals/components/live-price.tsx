"use client";

import type { EntryStatus } from "@aegis/contracts";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useLivePrice } from "@/features/signals/hooks/use-live-price";
import type { Opportunity } from "@/features/scanner/types";

/**
 * The live price, and the only thing a trader wants to know about it:
 * **is this trade still there?**
 *
 * Showing a ticking number alone would be decoration. What matters is the number
 * *relative to the entry we published* — because a signal that has already run
 * 0.6R in its own favour is not the trade we described, and taking it means
 * accepting a reward-to-risk we never promised.
 *
 * The verdict is the Risk Engine's to make (AGENTS.md §6). This renders it.
 */

const STATUS_META: Record<
  EntryStatus,
  { label: string; hint: string; tone: string }
> = {
  AT_ENTRY: {
    label: "At entry",
    hint: "Still actionable — price is where the signal said it would be.",
    tone: "text-success",
  },
  CHASING: {
    label: "Chasing",
    hint: "Price has moved in the trade's favour. Entering now buys a worse reward-to-risk than the signal promised.",
    tone: "text-warning",
  },
  MISSED: {
    label: "Missed",
    hint: "Price has run too far. The trade this signal described no longer exists — let it go.",
    tone: "text-destructive",
  },
  INVALIDATED: {
    label: "Invalidated",
    hint: "Price already reached the stop. This trade is dead.",
    tone: "text-destructive",
  },
};

export function LivePrice({
  signal,
  showHint = false,
}: {
  signal: Opportunity;
  showHint?: boolean;
}) {
  const { price, moveFromEntryPercent, status } = useLivePrice(signal);

  /*
   * No price yet — and we say so.
   *
   * The obvious alternative is to show the entry price until a real one arrives.
   * That is a lie with a straight face: it renders as "at entry, still
   * actionable" on a trade that may have hit its stop ten minutes ago, and the
   * trader has no way to tell. A dash is worth more than a plausible number.
   */
  if (price === null || status === null || moveFromEntryPercent === null) {
    return (
      <div className="flex items-baseline gap-2">
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className="font-numeric text-sm text-muted-foreground">
          Waiting for price…
        </span>
      </div>
    );
  }

  const meta = STATUS_META[status];
  const moved = moveFromEntryPercent;
  const sign = moved >= 0 ? "+" : "";

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>

        <span className="font-numeric text-sm font-semibold tabular-nums">
          {formatPrice(price)}
        </span>

        <span
          className={cn(
            "font-numeric text-xs",
            moved >= 0 ? "text-success" : "text-destructive",
          )}
        >
          {sign}
          {moved.toFixed(2)}% from entry
        </span>

        <span
          className={cn(
            "ml-auto text-[10px] font-semibold uppercase tracking-wide",
            meta.tone,
          )}
        >
          {meta.label}
        </span>
      </div>

      {showHint && (
        <p className="text-xs text-muted-foreground">{meta.hint}</p>
      )}
    </div>
  );
}
