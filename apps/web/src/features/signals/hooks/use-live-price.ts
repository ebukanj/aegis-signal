"use client";

import { useEffect, useState } from "react";
import type { EntryStatus } from "@aegis/contracts";
import { createSeededRandom } from "@/lib/seeded-random";
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
 * MOCK ONLY. This ticks a seeded random walk so the UI can be built. When the
 * backend ships, price arrives over the market WebSocket and `entryStatus` is
 * decided by the RISK ENGINE — not here. The frontend renders the verdict; it
 * does not reach it (AGENTS.md §6).
 */

export interface LivePriceState {
  price: number;
  /** Signed % move from the signal's entry, in the trade's favour when positive. */
  moveFromEntryPercent: number;
  status: EntryStatus;
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

  const move = isLong
    ? price - signal.entryPrice
    : signal.entryPrice - price;

  const moveFromEntryPercent = (move / signal.entryPrice) * 100;

  // Already at the stop — the trade is dead, whatever the entry says.
  const stopHit = isLong ? price <= signal.stopLoss : price >= signal.stopLoss;
  if (stopHit) return { status: "INVALIDATED", moveFromEntryPercent };

  const rMoved = risk > 0 ? move / risk : 0;

  if (rMoved >= MISSED_AT_R)
    return { status: "MISSED", moveFromEntryPercent };
  if (rMoved >= CHASING_AT_R)
    return { status: "CHASING", moveFromEntryPercent };

  return { status: "AT_ENTRY", moveFromEntryPercent };
}

export function useLivePrice(signal: Opportunity): LivePriceState {
  const [price, setPrice] = useState(() => {
    // Start close to entry but not exactly on it — a real feed never is.
    const rand = createSeededRandom(
      signal.id.split("").reduce((a, c) => a + c.charCodeAt(0), 3),
    );
    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
    const drift = (rand() - 0.35) * risk * 0.9;
    return signal.entryPrice + (signal.direction === "LONG" ? drift : -drift);
  });

  useEffect(() => {
    const risk = Math.abs(signal.entryPrice - signal.stopLoss);
    const interval = setInterval(() => {
      setPrice((current) => {
        // Small random walk, scaled to the trade's own risk unit.
        const step = (Math.random() - 0.5) * risk * 0.06;
        return Math.max(0.00000001, current + step);
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [signal.entryPrice, signal.stopLoss]);

  return { price, ...statusFor(signal, price) };
}
