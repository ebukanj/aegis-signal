import type { IRiskValidator, RiskContext, Verdict } from "../../domain/validator";

/**
 * The regime, checked AGAIN.
 *
 * ── Yes, the Strategy Evaluator already did this. That is the point. ──
 *
 * The evaluator's regime gate stops a strategy from *asking* in the wrong market. This
 * one stops a candidate from *surviving* in one — and the difference is not redundancy,
 * it is defence in depth.
 *
 * The Risk Engine is the last authority before a trade becomes a signal, and its
 * guarantee is unconditional: **nothing reaches a trader that this engine did not check.**
 * That guarantee cannot depend on an upstream engine having done its job correctly. If
 * the evaluator's gate ever regressed — a bug, a refactor, a hot-reloaded strategy whose
 * regimes were edited between evaluation and validation — a mean-reversion strategy would
 * walk straight into a trending market and nothing would stop it.
 *
 * The cost of checking twice is microseconds. The cost of trusting once is an account.
 */
export const regimeValidator: IRiskValidator = {
  name: "regime",
  weight: 0.15,

  validate({ candidate, strategy, market }: RiskContext): Verdict {
    const regime = candidate.regime;

    if (strategy.avoidRegimes.includes(regime)) {
      return {
        kind: "VETO",
        gate: "MARKET_CONDITION",
        reason: `${strategy.name} declares ${regime} as a market to AVOID — a candidate should never have been produced here, and the Risk Engine does not assume upstream got it right`,
      };
    }

    if (strategy.regimes.length > 0 && !strategy.regimes.includes(regime)) {
      return {
        kind: "VETO",
        gate: "MARKET_CONDITION",
        reason: `${strategy.name} is built for ${strategy.regimes.join(" or ")}, and this market is ${regime}`,
      };
    }

    /*
     * The higher-timeframe conflict.
     *
     * A 15m bull setup inside a 4h downtrend is a BOUNCE — the most expensive trade in
     * retail. Every rule passes, everything looks perfect, and the higher timeframe
     * reasserts itself and takes it all back plus the stop.
     *
     * The evaluator vetoes above 0.5. This engine is stricter, and deliberately so: the
     * evaluator is asking "is there an opportunity?", while the Risk Engine is asking
     * "should this opportunity be allowed to exist?" A trade the bigger chart is arguing
     * against is a trade the platform does not need to take.
     */
    const conflict = market.conflict;

    if (conflict >= RISK_CONFLICT_VETO) {
      const dissenting = Object.entries(market.timeframes)
        .filter(([tf]) => tf !== candidate.timeframe)
        .map(([tf, c]) => `${tf} is ${c.direction}`)
        .join(", ");

      return {
        kind: "VETO",
        gate: "MARKET_CONDITION",
        reason: `the higher timeframes contradict this trade (${dissenting}) — conflict ${conflict.toFixed(2)}. A ${candidate.timeframe} setup inside a hostile higher timeframe is a bounce, and a bounce is the most expensive trade in retail.`,
      };
    }

    const alignment = market.alignment;

    const rating =
      conflict > 0.15 ? "ELEVATED" : alignment > 0.85 ? "LOW" : "MODERATE";

    return {
      kind: "PASS",
      rating,
      measured: `${regime}, alignment ${alignment.toFixed(2)}, conflict ${conflict.toFixed(2)}`,
      warning:
        conflict > 0.15
          ? `the higher timeframes are not fully behind this (conflict ${conflict.toFixed(2)})`
          : undefined,
    };
  },
};

/**
 * The Risk Engine's conflict ceiling — lower than the evaluator's 0.5.
 *
 * The evaluator asks whether an opportunity exists. This asks whether it should be
 * allowed to. Those are different questions and they deserve different bars: a missed
 * trade is acceptable, and a trade the daily chart is arguing against is not one the
 * platform needs.
 */
const RISK_CONFLICT_VETO = 0.35;
