import { indicatorKey } from "@aegis/contracts";
import type { IRiskValidator, RiskContext, Verdict } from "../../domain/validator";
import { fmt, last, pct } from "./util";

/* ── Risk / reward ─────────────────────────────────────────────────── */

/**
 * Does the reward pay for the risk?
 *
 * ── Measured on the FIRST target, not the last ──
 *
 * The last target is a hope. The first is the one that actually gets hit, and it is the
 * one that pays for the losers. A platform that justified a trade on a 6R runner it
 * reaches once in twenty attempts would be doing arithmetic on a fantasy — the expectancy
 * would be beautiful and the account would still bleed.
 *
 * ── And there is a MAXIMUM, which surprises people ──
 *
 * A 40R target is not ambition. R is a *ratio*, and a ratio can be inflated from either
 * end: a spectacular R:R is nearly always a suspiciously tight stop rather than a
 * spectacular target. This gate catches the arithmetic looking better than the trade —
 * and it is one of the few places a platform can catch itself flattering its own numbers.
 */
export const riskRewardValidator: IRiskValidator = {
  name: "risk/reward",
  weight: 0.15,

  validate({ candidate, policy }: RiskContext): Verdict {
    const risk = Math.abs(candidate.entryPrice - candidate.proposedStop);
    const first = candidate.proposedTargets[0];

    const reward = Math.abs(first - candidate.entryPrice);
    const rr = reward / risk;

    if (rr < policy.minimumRiskReward) {
      return {
        kind: "VETO",
        gate: "RISK_REWARD",
        reason:
          `R:R is ${rr.toFixed(2)} on the first target (floor ${policy.minimumRiskReward}) — ` +
          `at this ratio the strategy must win more than ${((1 / (1 + rr)) * 100).toFixed(0)}% of the time ` +
          `simply to break even before fees, and not one strategy here has yet earned the right to claim any win rate at all`,
      };
    }

    if (rr > policy.maximumRiskReward) {
      return {
        kind: "VETO",
        gate: "RISK_REWARD",
        reason: `R:R is ${rr.toFixed(1)} (ceiling ${policy.maximumRiskReward}) — a ratio this flattering is almost always a stop that is far too tight rather than a target that is far away`,
      };
    }

    const rating = rr >= 3 ? "LOW" : rr >= 2 ? "MODERATE" : "ELEVATED";

    return {
      kind: "PASS",
      rating,
      measured: `R:R ${rr.toFixed(2)} to the first target (${fmt(first)}), risking ${fmt(risk)}`,
      warning:
        rr < 2
          ? `R:R is only ${rr.toFixed(2)} — this trade has to be right often to be worth taking`
          : undefined,
    };
  },
};

/* ── Stop quality ──────────────────────────────────────────────────── */

/**
 * Is the stop in a place that can actually work?
 *
 * ── The Risk Engine VETOES a bad stop. It does not move it. ──
 *
 * This is a decision worth stating plainly, because the alternative is tempting and
 * wrong. The engine could widen a too-tight stop to 1.5 ATR and let the trade through.
 * More signals would survive.
 *
 * But then the trade the trader takes is **not the trade the document described**. The
 * strategy's track record would be credited for a stop it never chose, and calibration
 * (ADR-024) would be measuring a hybrid nobody wrote — half strategy, half engine, and
 * accountable to neither.
 *
 * **The Risk Engine produces decisions, not edits.**
 *
 * ── Too tight: a stop inside the noise is a donation ──
 *
 * If the instrument routinely swings 1 ATR in a bar, a stop 0.4 ATR away is taken out by
 * the market doing nothing in particular. The trade never gets the chance to be right or
 * wrong — and the resulting loss is not information about the strategy, it is information
 * about the stop. Worse, those losses will be *attributed* to the strategy, and its
 * record will be wrong.
 *
 * ── Too wide: a stop that never triggers is not risk management ──
 *
 * A stop 8 ATR away cannot be hit by noise — because it cannot be hit by anything short
 * of the thesis being comprehensively wrong, by which point the loss is enormous. That is
 * hope with a price attached.
 */
export const stopQualityValidator: IRiskValidator = {
  name: "stop",
  weight: 0.1,

  validate(context: RiskContext): Verdict {
    const { candidate, policy } = context;

    const key = indicatorKey({
      indicator: "atr",
      timeframe: candidate.timeframe,
      params: { period: 14 },
    });

    const atr = last(context.indicators[key]);

    if (atr === null || atr <= 0) {
      return {
        kind: "VETO",
        gate: "STOP_QUALITY",
        reason:
          "ATR is unavailable — the platform cannot tell whether this stop sits inside the market's own noise, and a stop inside the noise is a donation",
      };
    }

    const distance = Math.abs(candidate.entryPrice - candidate.proposedStop);
    const inAtr = distance / atr;

    if (inAtr < policy.minimumStopAtr) {
      return {
        kind: "VETO",
        gate: "STOP_QUALITY",
        reason: `the stop is ${inAtr.toFixed(2)} ATR away (floor ${policy.minimumStopAtr}) — inside the noise this instrument routinely produces, so it would be taken out by the market doing nothing at all`,
      };
    }

    if (inAtr > policy.maximumStopAtr) {
      return {
        kind: "VETO",
        gate: "STOP_QUALITY",
        reason: `the stop is ${inAtr.toFixed(1)} ATR away (ceiling ${policy.maximumStopAtr}) — a stop that can only be hit by the thesis being comprehensively wrong is hope, not risk management`,
      };
    }

    const rating = inAtr >= 1.2 && inAtr <= 3 ? "LOW" : "MODERATE";

    return {
      kind: "PASS",
      rating,
      measured: `stop ${inAtr.toFixed(2)} ATR away (${pct((distance / candidate.entryPrice) * 100, 2)} of price)`,
      warning:
        inAtr < 1
          ? `the stop is only ${inAtr.toFixed(2)} ATR away — it will be tested by ordinary noise`
          : undefined,
    };
  },
};

/* ── Structure ─────────────────────────────────────────────────────── */

/**
 * Is the entry walking straight into a wall?
 *
 * ── The trade may be right and still be taken at the worst possible price ──
 *
 * A LONG entered one tick beneath a ceiling the market has rejected three times is being
 * asked to work from the exact spot where sellers are waiting. The setup can be perfect —
 * the pattern real, the momentum real, the regime right — and it will still be sold into,
 * because that is what the level *is*.
 *
 * This gate is the one that consumes the Pattern Engine's zones, and it is the reason
 * those zones are bands rather than lines: a "resistance at 62,400" would let a trade in
 * at 62,399 and call it clear. The band is the measurement.
 *
 * It vetoes only when the entry is *inside or immediately beneath* the zone. A trade with
 * room to run to the level is a normal trade — every long has resistance above it
 * somewhere, and refusing all of them would refuse the asset class.
 */
export const structureValidator: IRiskValidator = {
  name: "structure",
  weight: 0.07,

  validate({ candidate, zones, policy }: RiskContext): Verdict {
    const entry = candidate.entryPrice;
    const long = candidate.direction === "LONG";

    /*
     * A LONG cares about RESISTANCE above it; a SHORT cares about SUPPORT below.
     *
     * Broken zones are excluded: a resistance that price has closed decisively through is
     * no longer resistance — it is, quite often, support. The Zone Engine keeps it around
     * for exactly that reason, and vetoing a long because of a ceiling it has already
     * broken would be refusing the retest, which is the trade.
     */
    const relevant = zones.filter((zone) => {
      if (zone.broken) return false;

      if (long) {
        return (
          (zone.kind === "RESISTANCE" || zone.kind === "SUPPLY_BLOCK") &&
          zone.low >= entry
        );
      }

      return (
        (zone.kind === "SUPPORT" || zone.kind === "DEMAND_BLOCK") && zone.high <= entry
      );
    });

    if (relevant.length === 0) {
      return {
        kind: "PASS",
        rating: "LOW",
        measured: `no ${long ? "resistance" : "support"} zone between the entry and the first target`,
      };
    }

    // The nearest one. The others are somebody else's problem.
    const nearest = relevant.reduce((closest, zone) => {
      const a = long ? zone.low - entry : entry - zone.high;
      const b = long ? closest.low - entry : entry - closest.high;
      return a < b ? zone : closest;
    });

    const distance = long ? nearest.low - entry : entry - nearest.high;
    const distancePercent = (distance / entry) * 100;

    if (distancePercent < policy.minimumDistanceToStructurePercent) {
      return {
        kind: "VETO",
        gate: "STRUCTURE",
        reason:
          `the entry is ${pct(distancePercent, 2)} beneath a ${nearest.kind} zone at ` +
          `${fmt(nearest.low)}–${fmt(nearest.high)} (minimum ${pct(policy.minimumDistanceToStructurePercent, 1)}) — ` +
          `this trade is being taken at the exact price the market has turned around ${nearest.retests + 1} time(s)`,
      };
    }

    /*
     * The target sitting BEYOND the wall is a different, quieter problem.
     *
     * The trade has room to run to the level — but the target it is aiming for is on the
     * far side of it, so the reward the R:R was calculated on requires price to go
     * *through* a level it has repeatedly failed at. It is not a veto; it is a fact the
     * trader should know before they size.
     */
    const firstTarget = candidate.proposedTargets[0];

    const targetBeyond = long
      ? firstTarget > nearest.low
      : firstTarget < nearest.high;

    return {
      kind: "PASS",
      rating: targetBeyond ? "ELEVATED" : "LOW",
      measured: `nearest ${nearest.kind} is ${pct(distancePercent, 2)} away (${fmt(nearest.low)}–${fmt(nearest.high)}, ${nearest.retests} retest(s))`,
      warning: targetBeyond
        ? `the first target sits BEYOND a ${nearest.kind} zone the market has respected ${nearest.retests + 1} time(s) — the reward this R:R assumes requires price to break through it`
        : undefined,
    };
  },
};

/* ── Correlation ───────────────────────────────────────────────────── */

/**
 * Is this altcoin just a leveraged bet on BTC?
 *
 * ── A warning, not a veto — and the reason matters ──
 *
 * Most of crypto is correlated to BTC most of the time. Vetoing everything above 0.85
 * would veto the asset class, and a risk engine that rejects everything is not a risk
 * engine, it is an off switch.
 *
 * But a trader holding five "independent" positions that are all really the same BTC bet
 * is holding **one position at five times the size**, and does not know it. The moment
 * BTC moves against them, all five stops go at once — and the account discovers its true
 * exposure at the worst possible moment.
 *
 * This gate can only *warn*, because there is no ledger and therefore no portfolio to be
 * concentrated in. **When the ledger lands (M11), it becomes a real veto** — and the
 * interface is built so that is a change to this file and nothing else.
 */
export const correlationValidator: IRiskValidator = {
  name: "correlation",
  weight: 0.03,

  validate({ btcCorrelation, candidate, policy }: RiskContext): Verdict {
    if (candidate.symbol === "BTC") {
      return {
        kind: "PASS",
        rating: "LOW",
        measured: "this IS BTC — correlation to itself is not a risk",
      };
    }

    if (btcCorrelation === null) {
      return {
        kind: "UNASSESSED",
        reason:
          "BTC correlation could not be computed — this position's true independence from the rest of the market is unknown",
      };
    }

    const correlated = btcCorrelation >= policy.correlationWarningThreshold;

    return {
      kind: "PASS",
      rating: correlated ? "ELEVATED" : "LOW",
      measured: `${(btcCorrelation * 100).toFixed(0)}% correlated to BTC`,
      warning: correlated
        ? `this is ${(btcCorrelation * 100).toFixed(0)}% correlated to BTC — it is not an independent position, it is a leveraged bet on Bitcoin wearing another ticker`
        : undefined,
    };
  },
};
