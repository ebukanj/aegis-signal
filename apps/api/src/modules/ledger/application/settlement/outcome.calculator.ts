import type { Candle, ExitReason, OutcomeType, Settlement } from "@aegis/contracts";

/**
 * What did the trade actually do? Computed from market data, never asserted.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS THE ONE PLACE THE PLATFORM DECIDES WHETHER IT WAS RIGHT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every track-record number, every calibration input, every strategy statistic
 * descends from this function. So it is deterministic, it is driven only by price,
 * and — where the price path is ambiguous — it is pessimistic, for the same reason
 * the confidence replay is (M09): a platform whose premise is "measured, never
 * asserted" does not resolve its own ambiguities in its own favour.
 *
 * ── The one-bar-touched-both problem, again ──
 *
 * A single candle whose range covers BOTH a target and the stop tells us both
 * traded, not in which order. We take the STOP. It is the honest reading when the
 * data cannot say, and it is the same rule the confidence labeller uses, so the
 * ledger and the calibration agree about what a win is.
 */

export interface SettlementInput {
  direction: "LONG" | "SHORT";
  entryPrice: number;
  stopLoss: number;
  takeProfits: readonly number[];
  publishedAt: number;
  /** Candles from publication onward, oldest first. The trade's future. */
  future: readonly Candle[];
  /** A setup that never triggers within this many bars is CANCELLED. */
  maxBarsToTrigger: number;
  /** A triggered trade that resolves neither way within this many bars EXPIRES. */
  maxBarsToResolve: number;
  barMs: number;
}

/**
 * Walk the price path and settle. The result is frozen by the caller; this only
 * computes it.
 */
export function calculateOutcome(input: SettlementInput): Settlement {
  const { direction, entryPrice, stopLoss, takeProfits } = input;
  const long = direction === "LONG";
  const risk = Math.abs(entryPrice - stopLoss);

  if (risk <= 0) {
    throw new Error("A signal with no risk cannot be settled — its R is undefined");
  }

  /* ── 1 · Did price ever reach the entry? ───────────────────────── */

  let triggerIndex = -1;
  for (let i = 0; i < input.future.length && i < input.maxBarsToTrigger; i += 1) {
    const bar = input.future[i];
    /* Entry is "reached" if the bar's range contains it. */
    if (bar.low <= entryPrice && entryPrice <= bar.high) {
      triggerIndex = i;
      break;
    }
  }

  if (triggerIndex === -1) {
    /* Never triggered — the trade the signal described never happened. */
    return {
      outcome: "CANCELLED",
      exitReason: "NEVER_TRIGGERED",
      realisedR: 0,
      pnlPercent: 0,
      exitPrice: entryPrice,
      mfeR: 0,
      maeR: 0,
      barsHeld: 0,
      triggeredAt: null,
      settledAt: input.publishedAt + input.maxBarsToTrigger * input.barMs,
    };
  }

  const triggeredAt = input.future[triggerIndex].time;

  /* ── 2 · Walk forward from the trigger, tracking excursions ────── */

  let mfe = 0; // best in R, favourable
  let mae = 0; // worst in R, adverse (kept positive)

  /* Sorted targets, nearest first, so TARGET_1/2/3 mean what they say. */
  const targets = [...takeProfits].sort((a, b) => (long ? a - b : b - a));
  let targetsHit = 0;

  const favourable = (price: number): number =>
    long ? (price - entryPrice) / risk : (entryPrice - price) / risk;

  for (let i = triggerIndex; i < input.future.length; i += 1) {
    if (i - triggerIndex > input.maxBarsToResolve) break;

    const bar = input.future[i];

    /* Excursions from the extremes the bar reached. */
    mfe = Math.max(mfe, favourable(long ? bar.high : bar.low));
    mae = Math.max(mae, -favourable(long ? bar.low : bar.high));

    const hitStop = long ? bar.low <= stopLoss : bar.high >= stopLoss;
    const nextTarget = targets[targetsHit];
    const hitTarget =
      nextTarget !== undefined && (long ? bar.high >= nextTarget : bar.low <= nextTarget);

    /*
     * The ambiguous bar: it reached the stop AND the next target. We cannot know
     * the order, so we take the stop — the pessimistic, honest reading, matching
     * the confidence labeller so a "win" means the same thing in both.
     */
    if (hitStop && hitTarget) {
      return settleAtStop(input, {
        entryPrice,
        stopLoss,
        risk,
        long,
        targetsHit,
        mfe,
        mae,
        exitBar: bar,
        barsHeld: i - triggerIndex + 1,
        triggeredAt,
      });
    }

    if (hitTarget) {
      targetsHit += 1;
      /* All targets hit — a clean, full winner. */
      if (targetsHit === targets.length) {
        const exitPrice = targets[targetsHit - 1];
        return {
          outcome: "WINNER",
          exitReason: reasonForTarget(targetsHit),
          realisedR: favourable(exitPrice),
          pnlPercent: pnl(long, entryPrice, exitPrice),
          exitPrice,
          mfeR: round2(Math.max(mfe, favourable(exitPrice))),
          maeR: round2(mae),
          barsHeld: i - triggerIndex + 1,
          triggeredAt,
          settledAt: bar.time,
        };
      }
      /* Otherwise: partial target hit; keep walking toward the next or the stop. */
    }

    if (hitStop) {
      return settleAtStop(input, {
        entryPrice,
        stopLoss,
        risk,
        long,
        targetsHit,
        mfe,
        mae,
        exitBar: bar,
        barsHeld: i - triggerIndex + 1,
        triggeredAt,
      });
    }
  }

  /* ── 3 · Neither resolved within the horizon — EXPIRED ─────────── */

  const lastBar = input.future[Math.min(input.future.length - 1, triggerIndex + input.maxBarsToResolve)];
  const exitPrice = lastBar.close;
  const r = favourable(exitPrice);

  return {
    /* A partial winner that then expired is still recorded by its net R, but the
     * outcome reflects that some target was banked. */
    outcome: targetsHit > 0 ? (r >= 0 ? "PARTIAL_WINNER" : "PARTIAL_LOSER") : "EXPIRED",
    exitReason: "EXPIRY",
    realisedR: round2(r),
    pnlPercent: pnl(long, entryPrice, exitPrice),
    exitPrice,
    mfeR: round2(mfe),
    maeR: round2(mae),
    barsHeld: Math.min(input.future.length - 1 - triggerIndex, input.maxBarsToResolve),
    triggeredAt,
    settledAt: lastBar.time,
  };
}

/* ── Settling at the stop, with or without banked targets ──────────── */

function settleAtStop(
  input: SettlementInput,
  ctx: {
    entryPrice: number;
    stopLoss: number;
    risk: number;
    long: boolean;
    targetsHit: number;
    mfe: number;
    mae: number;
    exitBar: Candle;
    barsHeld: number;
    triggeredAt: number;
  },
): Settlement {
  const { long, entryPrice, stopLoss, targetsHit } = ctx;

  /*
   * The realised R depends on whether any target was banked first.
   *
   * A clean stop with nothing banked is −1R. But a trade that hit its first target
   * (banking, say, half at +1.5R) and was then stopped on the runner is NOT a −1R
   * loss — it is a scaled exit that netted positive, and recording it as a full
   * loss would slander the strategy. We approximate the scaled result: banked
   * targets at their R, plus the remainder stopped at −1R, evenly weighted.
   */
  let realisedR: number;
  let outcome: OutcomeType;

  if (targetsHit === 0) {
    realisedR = -1;
    outcome = "LOSER";
  } else {
    const targets = [...input.takeProfits].sort((a, b) => (long ? a - b : b - a));
    const bankedR =
      targets.slice(0, targetsHit).reduce((sum, t) => sum + Math.abs(t - entryPrice) / ctx.risk, 0) /
      input.takeProfits.length;
    const remainder = (input.takeProfits.length - targetsHit) / input.takeProfits.length;
    realisedR = bankedR - remainder; // remainder stopped at −1R each, weighted
    outcome = realisedR >= 0 ? "PARTIAL_WINNER" : "PARTIAL_LOSER";
  }

  return {
    outcome,
    exitReason: "STOP_LOSS",
    realisedR: round2(realisedR),
    pnlPercent: pnl(long, entryPrice, stopLoss),
    exitPrice: stopLoss,
    mfeR: round2(ctx.mfe),
    maeR: round2(Math.max(ctx.mae, 1)), // a stop hit means at least 1R adverse
    barsHeld: ctx.barsHeld,
    triggeredAt: ctx.triggeredAt,
    settledAt: ctx.exitBar.time,
  };
}

function reasonForTarget(n: number): ExitReason {
  return n >= 3 ? "TARGET_3" : n === 2 ? "TARGET_2" : "TARGET_1";
}

function pnl(long: boolean, entry: number, exit: number): number {
  return round2(((long ? exit - entry : entry - exit) / entry) * 100);
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
