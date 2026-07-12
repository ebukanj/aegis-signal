/**
 * Business invariants enforced at runtime, on every DTO that crosses the wire.
 *
 * These are rules from the Product Bible and the ADRs expressed as code. A
 * backend bug that violates one becomes a validation error at the boundary
 * instead of an unexecutable trade on a user's screen (Founding Principle 13 —
 * Fail Safely).
 */

/** SHORT is always PERPETUAL — spot cannot be shorted (ADR-021 §3). */
export const shortImpliesPerpetual = <
  T extends { direction: "LONG" | "SHORT"; marketType: "SPOT" | "PERPETUAL" },
>(
  value: T,
): boolean => value.direction !== "SHORT" || value.marketType === "PERPETUAL";

export const SHORT_IS_PERPETUAL = {
  message: "A SHORT signal must be PERPETUAL — spot cannot be shorted",
  path: ["marketType"],
};

/** Leverage exists for PERPETUAL trades and only for PERPETUAL trades. */
export const leverageMatchesMarketType = <
  T extends { marketType: "SPOT" | "PERPETUAL"; suggestedLeverage: number | null },
>(
  value: T,
): boolean =>
  value.marketType === "PERPETUAL"
    ? value.suggestedLeverage !== null
    : value.suggestedLeverage === null;

export const LEVERAGE_MATCHES_MARKET_TYPE = {
  message:
    "PERPETUAL trades must carry a suggested leverage; SPOT trades must not",
  path: ["suggestedLeverage"],
};

/** The stop must invalidate the trade: below entry for LONG, above for SHORT. */
export const stopIsOnInvalidationSide = <
  T extends { direction: "LONG" | "SHORT"; entryPrice: number; stopLoss: number },
>(
  value: T,
): boolean =>
  value.direction === "LONG"
    ? value.stopLoss < value.entryPrice
    : value.stopLoss > value.entryPrice;

export const STOP_ON_INVALIDATION_SIDE = {
  message:
    "Stop loss must sit below entry for a LONG and above entry for a SHORT",
  path: ["stopLoss"],
};
