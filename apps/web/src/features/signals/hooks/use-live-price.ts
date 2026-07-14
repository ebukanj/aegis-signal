"use client";

import { useEffect, useState } from "react";
import type { EntryStatus } from "@aegis/contracts";
import { watchSymbol, type PriceTick } from "@/lib/market-socket";
import type { Opportunity } from "@/features/scanner/types";

/**
 * Live price, and whether the trade has already run away.
 *
 * A signal's entry goes stale the moment it is published. If we said "enter near
 * $145.30" and price is now $149, the trade the signal described no longer
 * exists — chasing it buys a worse reward-to-risk than the one we promised.
 * Without this, a trader cannot tell an actionable signal from a departed one,
 * and "here is a trade worth taking RIGHT NOW" is the entire product.
 *
 * **The price is real.** It arrives over the market WebSocket from Binance, via
 * the backend, validated at the boundary. This hook used to tick a seeded random
 * walk so the UI could be built; that mock is gone (docs/MOCK_RETIREMENT.md).
 *
 * When no price has arrived yet, `price` is `null` and the component says so.
 * That is the whole point of the change: a plausible invented number is worse
 * than an honest blank, because a trader cannot tell the two apart.
 *
 * The `status` verdict still lives here, and it should not. It belongs to the
 * RISK ENGINE (AGENTS.md §6) and moves there when the Signal module ships — at
 * which point the backend sends the verdict and this hook only renders it.
 */

export interface LivePriceState {
  /** Null until the first real tick. Never a placeholder. */
  price: number | null;
  /** Signed % move from the signal's entry, in the trade's favour when positive. */
  moveFromEntryPercent: number | null;
  status: EntryStatus | null;
}

/**
 * How far is too far?
 *
 * Expressed in R — the distance to the stop — because that is the only unit in
 * which "too far" means anything. A $3 move is nothing on BTC and everything on
 * a memecoin; 0.5R is 0.5R on both.
 */
const CHASING_AT_R = 0.25;
const MISSED_AT_R = 0.6;

function statusFor(
  signal: Opportunity,
  price: number,
): { status: EntryStatus; moveFromEntryPercent: number } {
  const isLong = signal.direction === "LONG";
  const risk = Math.abs(signal.entryPrice - signal.stopLoss);

  const move = isLong ? price - signal.entryPrice : signal.entryPrice - price;
  const moveFromEntryPercent = (move / signal.entryPrice) * 100;

  // Already at the stop — the trade is dead, whatever the entry says.
  const stopHit = isLong ? price <= signal.stopLoss : price >= signal.stopLoss;
  if (stopHit) return { status: "INVALIDATED", moveFromEntryPercent };

  const rMoved = risk > 0 ? move / risk : 0;

  if (rMoved >= MISSED_AT_R) return { status: "MISSED", moveFromEntryPercent };
  if (rMoved >= CHASING_AT_R) return { status: "CHASING", moveFromEntryPercent };

  return { status: "AT_ENTRY", moveFromEntryPercent };
}

export function useLivePrice(signal: Opportunity): LivePriceState {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    setPrice(null);
    return watchSymbol(signal.coin, (tick: PriceTick) => setPrice(tick.price));
  }, [signal.coin]);

  if (price === null) {
    return { price: null, moveFromEntryPercent: null, status: null };
  }

  return { price, ...statusFor(signal, price) };
}
