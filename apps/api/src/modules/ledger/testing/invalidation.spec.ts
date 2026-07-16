import { describe, expect, it } from "vitest";

import { invalidatedBeforeTrigger } from "../application/settlement/settlement.worker";

/**
 * The owner's rule: an invalidated signal must leave the feed fast — not linger for
 * the full trigger window. `invalidatedBeforeTrigger` is the detector that lets the
 * Settlement Worker drop it on the next 30s sweep. These cases pin the exact
 * boundary: stop-breached-before-entry is invalidation; entry-first is a real trade
 * the normal calculator must own.
 */
describe("invalidatedBeforeTrigger — the 5-minute rule's detector", () => {
  const long = { direction: "LONG", entryPrice: 100, stopLoss: 95 };
  const short = { direction: "SHORT", entryPrice: 100, stopLoss: 105 };

  it("LONG: a bar that breaks the stop before entry is invalidated", () => {
    // Price falls to 94 (below the 95 stop) without ever reaching the 100 entry.
    expect(invalidatedBeforeTrigger(long, [{ high: 98, low: 94 }])).toBe(true);
  });

  it("LONG: a bar that reaches the entry first is NOT invalidated — it triggered", () => {
    // The bar's range spans the entry, so the trade began; the calculator owns it.
    expect(invalidatedBeforeTrigger(long, [{ high: 101, low: 94 }])).toBe(false);
  });

  it("LONG: price drifting below entry but never hitting the stop is still live", () => {
    expect(invalidatedBeforeTrigger(long, [{ high: 99, low: 96 }])).toBe(false);
  });

  it("SHORT: a bar that breaks the stop before entry is invalidated", () => {
    // Price rises to 106 (above the 105 stop) without reaching the 100 entry.
    expect(invalidatedBeforeTrigger(short, [{ high: 106, low: 101 }])).toBe(true);
  });

  it("SHORT: reaching the entry first is a trigger, not an invalidation", () => {
    expect(invalidatedBeforeTrigger(short, [{ high: 106, low: 99 }])).toBe(false);
  });

  it("honours candle ORDER: a trigger before a later stop breach is a real trade", () => {
    expect(
      invalidatedBeforeTrigger(long, [
        { high: 101, low: 99 }, // triggered here
        { high: 96, low: 94 }, // stop breached later — but the trade already began
      ]),
    ).toBe(false);
  });

  it("no bars yet means nothing to invalidate", () => {
    expect(invalidatedBeforeTrigger(long, [])).toBe(false);
  });
});
