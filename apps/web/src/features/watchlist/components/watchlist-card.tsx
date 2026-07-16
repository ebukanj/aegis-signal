"use client";

import { useState } from "react";
import { Star, X, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWatchlist } from "@/features/watchlist/hooks/use-watchlist";

/**
 * The watchlist manager. Add the coins you care about; the platform scans them
 * as PRIORITY every sweep, so a setup on one of them is never missed. It is a
 * priority list, not a filter — you still see every other Prime signal too.
 */
export function WatchlistCard() {
  const { coins, isLoading, add, remove, isMutating } = useWatchlist();
  const [value, setValue] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const coin = value.trim().toUpperCase();
    if (!coin) return;
    add(coin);
    setValue("");
  };

  return (
    <Card className="gap-3 p-4">
      <div className="flex items-center gap-2">
        <Star className="size-4 text-warning" aria-hidden />
        <h2 className="text-sm font-semibold tracking-tight">Your watchlist</h2>
        <span className="text-xs text-muted-foreground">
          scanned as priority — never missed
        </span>
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a coin — e.g. BTC"
          aria-label="Add a coin to your watchlist"
          className="h-9 max-w-52 uppercase"
          maxLength={20}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={isMutating || !value.trim()}>
          <Plus className="size-4" />
          Add
        </Button>
      </form>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading your watchlist…</p>
      ) : coins.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nothing yet. Add a coin and the platform prioritises it on every scan.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {coins.map((coin) => (
            <li key={coin}>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs font-medium",
                  "transition-colors hover:border-destructive/40",
                )}
              >
                {coin}
                <button
                  type="button"
                  onClick={() => remove(coin)}
                  disabled={isMutating}
                  aria-label={`Remove ${coin} from watchlist`}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
