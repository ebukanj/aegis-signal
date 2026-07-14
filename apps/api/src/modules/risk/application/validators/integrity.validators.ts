import { indicatorKey } from "@aegis/contracts";
import type { IRiskValidator, RiskContext, Verdict } from "../../domain/validator";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";
import { last } from "./util";

/**
 * The gates that fire before the market is even examined.
 *
 * These do not ask "is this a good trade?" They ask "is this a *real* trade, about a
 * market we can actually see, right now?" — and a NO here is not the machine working, it
 * is the machine catching something that should never have reached it.
 */

/* ── The candidate itself ──────────────────────────────────────────── */

/**
 * Is this candidate even coherent?
 *
 * The contract already refuses a stop on the wrong side of entry, so most nonsense dies
 * before it gets here. This catches what a schema cannot: a stop *equal* to the entry, a
 * target that duplicates the entry, arithmetic that has escaped its market.
 *
 * ── Why a zero-risk trade is the most dangerous thing in this file ──
 *
 * If entry equals stop, then `(equity × risk%) / |entry − stop|` divides by zero and
 * hands back an INFINITE position size. It does not look like a bug. It looks like the
 * best trade the platform has ever produced — right up until the liquidation.
 */
export const candidateIntegrityValidator: IRiskValidator = {
  name: "candidate",
  weight: 0,

  validate({ candidate, policy }: RiskContext): Verdict {
    const { entryPrice, proposedStop, proposedTargets, direction } = candidate;

    const risk = Math.abs(entryPrice - proposedStop);

    if (!Number.isFinite(risk) || risk <= 0) {
      return {
        kind: "VETO",
        gate: "INVALID_CANDIDATE",
        reason: `the stop (${proposedStop}) sits on the entry (${entryPrice}) — a zero-risk trade divides by zero and produces an infinite position size`,
      };
    }

    const wrongSide =
      direction === "LONG" ? proposedStop >= entryPrice : proposedStop <= entryPrice;

    if (wrongSide) {
      return {
        kind: "VETO",
        gate: "INVALID_CANDIDATE",
        reason: `a ${direction} stops ${direction === "LONG" ? "below" : "above"} its entry, and this one does not (entry ${entryPrice}, stop ${proposedStop})`,
      };
    }

    if (proposedTargets.length === 0) {
      return {
        kind: "VETO",
        gate: "INVALID_CANDIDATE",
        reason: "the candidate has no targets — a trade with no exit is not a trade",
      };
    }

    if (!policy.allowedTimeframes.includes(candidate.timeframe)) {
      return {
        kind: "VETO",
        gate: "INVALID_CANDIDATE",
        reason: `the ${candidate.timeframe} timeframe is not permitted by policy (allowed: ${policy.allowedTimeframes.join(", ")})`,
      };
    }

    if (!policy.allowedExchanges.includes(candidate.exchange)) {
      return {
        kind: "VETO",
        gate: "INVALID_CANDIDATE",
        reason: `${candidate.exchange} is not a permitted exchange (allowed: ${policy.allowedExchanges.join(", ")})`,
      };
    }

    return {
      kind: "PASS",
      rating: "LOW",
      measured: `entry ${entryPrice}, stop ${proposedStop}, ${proposedTargets.length} target(s)`,
    };
  },
};

/* ── Freshness ─────────────────────────────────────────────────────── */

/**
 * Is the evidence still true?
 *
 * ── Stale data is worse than no data ──
 *
 * That is the whole of this gate. A missing price announces itself: the field is empty,
 * something is obviously wrong, and everybody stops. **A stale price looks exactly like a
 * live one.** There is nothing about the number 63,204 that says "I am four minutes old",
 * and every engine downstream will treat it with total confidence.
 *
 * So a candidate evaluated on a bar that closed several bars ago is not a slightly-late
 * candidate. It is a candidate about a market that has moved on, and the stop, the
 * targets and the entry all belong to a world that no longer exists.
 */
export const freshnessValidator: IRiskValidator = {
  name: "freshness",
  weight: 0,

  validate({ candidate, policy, now }: RiskContext): Verdict {
    const bar = timeframeMs(candidate.timeframe);
    const age = now - candidate.barTime;

    /*
     * The bar the candidate fired on has closed, so it is at least one bar old by
     * definition — that is not staleness, that is how a closed candle works. Age is
     * measured in bars BEYOND its own close.
     */
    const barsOld = Math.floor(age / bar) - 1;

    if (barsOld > policy.maximumEvidenceAgeBars) {
      return {
        kind: "VETO",
        gate: "STALE_DATA",
        reason: `the evidence is ${barsOld} bars old (limit ${policy.maximumEvidenceAgeBars}) — this candidate describes a market that has moved on`,
      };
    }

    return {
      kind: "PASS",
      rating: barsOld >= 1 ? "MODERATE" : "LOW",
      measured: `evidence is ${Math.max(0, barsOld)} bar(s) past its close`,
      warning:
        barsOld >= 1
          ? `the evaluation is ${barsOld} bar(s) behind the market`
          : undefined,
    };
  },
};

/* ── The exchange ──────────────────────────────────────────────────── */

/**
 * Can we still see the market at all?
 *
 * ── A gate that SHOULD see and cannot is a VETO ──
 *
 * This is the line the platform draws, and it is the answer to "if uncertain, reject".
 *
 * A gate whose feed has never been BUILT (news, portfolio) does not veto — it declares
 * itself unassessed and the trader is told. But a gate whose feed exists, is depended
 * upon, and has *gone dark* is a different animal: the absence is itself the risk signal.
 * An exchange that has stopped answering is an exchange whose prices we are no longer
 * receiving, and a trade placed into it is a trade placed blind.
 */
export const exchangeHealthValidator: IRiskValidator = {
  name: "exchange",
  /*
   * Weight ZERO — and that is not an oversight.
   *
   * A dead exchange is not a trade that is "somewhat riskier". It is a trade that cannot
   * happen. This gate vetoes or it passes, and a passing exchange is simply the normal
   * state of the world — it should not make a trade look SAFER than one on an exchange
   * that is equally alive. A hard gate does not colour the score; it opens or shuts a door.
   */
  weight: 0,

  validate({ exchange, policy }: RiskContext): Verdict {
    if (!exchange) {
      return {
        kind: "VETO",
        gate: "EXCHANGE_HEALTH",
        reason:
          "the exchange's health is unknown — the platform cannot confirm the market it is about to trade into is even reachable",
      };
    }

    if (!exchange.connected) {
      return {
        kind: "VETO",
        gate: "EXCHANGE_HEALTH",
        reason: `${exchange.exchange} is disconnected — trading into a market we cannot see`,
      };
    }

    if (exchange.circuitOpen) {
      return {
        kind: "VETO",
        gate: "EXCHANGE_HEALTH",
        reason: `${exchange.exchange}'s circuit breaker is OPEN — it has been failing repeatedly`,
      };
    }

    if (
      exchange.latencyMs !== null &&
      exchange.latencyMs > policy.maximumExchangeLatencyMs
    ) {
      return {
        kind: "VETO",
        gate: "EXCHANGE_HEALTH",
        reason: `${exchange.exchange} is answering in ${exchange.latencyMs}ms (limit ${policy.maximumExchangeLatencyMs}ms) — it is degrading, and a degrading exchange is one whose fills will not be where you expect`,
      };
    }

    return {
      kind: "PASS",
      rating: "LOW",
      measured: `${exchange.exchange} connected, ${exchange.latencyMs ?? "?"}ms, ${exchange.reconnectCount} reconnect(s)`,
    };
  },
};

/* ── The gates that cannot see yet ─────────────────────────────────── */

/**
 * NEWS — and the honest admission that nobody is looking.
 *
 * A stop into a CPI print is not a stop. The market gaps straight through it and the
 * fill is wherever the fill happens to be. It is one of the few ways a *correct* trade
 * loses far more than it risked.
 *
 * The News Engine is Milestone 09. Until it exists, this gate does not veto — vetoing on
 * a feed that has not been built would mean the platform emits nothing at all for three
 * more milestones.
 *
 * **But it does not pass, either.** It declares itself, loudly, and the words travel with
 * the decision all the way to the trader. An approval that says *"nobody checked for
 * news"* is honest. An approval that quietly did not check is a lie with a green tick.
 */
export const newsValidator: IRiskValidator = {
  name: "news",
  weight: 0,

  validate(): Verdict {
    return {
      kind: "UNASSESSED",
      reason:
        "no news feed exists yet — nobody has checked whether a high-impact print, an unlock, or an exchange outage is imminent. A stop into CPI is not a stop.",
    };
  },
};

/**
 * PORTFOLIO HEAT — unknowable without a ledger.
 *
 * Five "independent" trades that are each risking 1% are not risking 1%. They are risking
 * 5%, and if they are all really the same BTC bet they are risking it five times over on
 * one idea.
 *
 * There is no ledger and there are no open positions, so there is nothing to be
 * concentrated in. When the ledger lands (M11), this becomes a real veto.
 */
export const portfolioHeatValidator: IRiskValidator = {
  name: "portfolio",
  weight: 0,

  validate(): Verdict {
    return {
      kind: "UNASSESSED",
      reason:
        "there is no position ledger yet — total open risk and correlated exposure cannot be measured, so this trade is being judged entirely on its own merits and not on what it would sit alongside",
    };
  },
};

/**
 * DERIVATIVES — funding and open interest.
 *
 * Crowd Squeeze already stands down for want of this feed. For every other strategy it
 * is a missing *risk* input rather than a missing entry condition: extreme funding means
 * one side of the market is paying heavily to stay there, and that side is the one that
 * gets liquidated.
 */
export const derivativesValidator: IRiskValidator = {
  name: "derivatives",
  weight: 0,

  validate({ candidate }: RiskContext): Verdict {
    if (candidate.market !== "PERPETUAL") {
      return {
        kind: "PASS",
        rating: "LOW",
        measured: "spot — funding and open interest do not apply",
      };
    }

    return {
      kind: "UNASSESSED",
      reason:
        "no derivatives feed exists yet — funding rate and open interest are invisible, so a crowded, over-leveraged one-sided market would look identical to a healthy one",
    };
  },
};

/* ── shared ────────────────────────────────────────────────────────── */

export { last, atrOf };

/** The ATR the candidate's own timeframe was evaluated on. */
function atrOf(context: RiskContext, period = 14): number | null {
  const key = indicatorKey({
    indicator: "atr",
    timeframe: context.candidate.timeframe,
    params: { period },
  });

  return last(context.indicators[key]);
}
