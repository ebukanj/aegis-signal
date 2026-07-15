import type { ConfidenceContributor } from "@aegis/contracts";
import { SCOREABLE_RISK_FACTORS, type IContributor } from "../../domain/scoring";

/**
 * The contributors. Each one measures something real on the candle, states what
 * it measured, and moves the score by a stated amount.
 *
 * ── Why every one of these is arithmetic, and none of them is a track record ──
 *
 * ADR-024's central distinction: *the evidence is real from day one; only the
 * leap from score to probability needs history.* "Volume is 2.3× its 20-bar
 * average" is a fact about this candle. It does not become more true after a
 * thousand trades, and it does not need to wait for them.
 *
 * So these contributors are honest on the very first bar the platform ever sees.
 * What they are NOT is a probability. Their sum is a score, and a score means
 * nothing at all until the calibration says what it has historically been worth.
 */

const last = (series: readonly (number | null)[] | null | undefined): number | null => {
  if (!series) return null;
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const v = series[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
};

/** Clamp a −1…+1 signal onto ±weight, rounded to a whole point. */
const points = (signal: number, weight: number): number =>
  Math.round(Math.max(-1, Math.min(1, signal)) * weight);

/* ── Trend alignment ───────────────────────────────────────────────── */

/**
 * Do the timeframes agree?
 *
 * A long on the 1h while the 4h and 1d are both rolling over is a trade fighting
 * the tide. The Regime Engine already computed the alignment across timeframes;
 * this is where that work becomes points.
 *
 * The penalty side matters more than the bonus side. Alignment is *expected* —
 * most setups fire in the direction of the prevailing trend — so a strongly
 * aligned setup is merely normal, while a CONFLICTED one is a genuine warning.
 */
export const trendAlignmentContributor: IContributor = {
  name: "trend alignment",

  contribute(context): ConfidenceContributor | null {
    const { alignment, conflict } = context.market;

    /* Alignment is 0…1 and conflict is 0…1; the net is what we score. */
    const net = alignment - conflict;

    return {
      name: "Trend alignment",
      weight: points(net, context.policy.weights.trendAlignment),
      source: "MEASURED",
      measured: `${(alignment * 100).toFixed(0)}% of timeframes aligned, ${(conflict * 100).toFixed(0)}% in conflict`,
      note:
        conflict > 0.3
          ? "higher timeframes disagree with this trade — it is being taken against the tide"
          : "the timeframes broadly agree on direction",
    };
  },
};

/* ── Momentum ──────────────────────────────────────────────────────── */

/**
 * Is momentum behind the trade, or is the trade the last gasp of a move?
 *
 * RSI and the MACD histogram, read in the direction of the trade. A long into an
 * RSI of 78 is not "strong" — it is late, and the contributor says so with a
 * penalty rather than a bonus. That asymmetry is deliberate: overextension is
 * one of the most reliable ways a technically perfect setup loses money.
 */
export const momentumContributor: IContributor = {
  name: "momentum",

  contribute(context): ConfidenceContributor | null {
    const rsi = last(context.series.rsi);
    const hist = last(context.series.macdHistogram);

    if (rsi === null && hist === null) return null;

    const long = context.candidate.direction === "LONG";
    let signal = 0;
    const parts: string[] = [];

    if (rsi !== null) {
      parts.push(`RSI ${rsi.toFixed(1)}`);

      /*
       * Distance from 50, in the trade's favour — but REVERSED once it passes
       * into exhaustion. A long is helped by RSI 60 and hurt by RSI 80.
       */
      const favour = long ? rsi - 50 : 50 - rsi;
      const exhausted = long ? rsi > 72 : rsi < 28;

      signal += exhausted ? -(Math.abs(favour) - 22) / 28 : favour / 30;
    }

    if (hist !== null) {
      parts.push(`MACD histogram ${hist > 0 ? "positive" : "negative"}`);
      const agrees = long ? hist > 0 : hist < 0;
      signal += agrees ? 0.4 : -0.4;
    }

    const weight = points(signal / 2, context.policy.weights.momentum);

    return {
      name: "Momentum",
      weight,
      source: "MEASURED",
      measured: parts.join(", "),
      note:
        weight < 0
          ? "momentum is against this trade, or the move is already overextended"
          : "momentum supports the direction of the trade",
    };
  },
};

/* ── Volume ────────────────────────────────────────────────────────── */

/**
 * Did anybody actually show up?
 *
 * A breakout on thin volume is a breakout nobody participated in, and it is the
 * classic way a chart looks right and behaves wrong. Measured against the
 * instrument's own recent volume, never against an absolute figure — 400 BTC is
 * enormous on one pair and a rounding error on another.
 */
export const volumeContributor: IContributor = {
  name: "volume",

  contribute(context): ConfidenceContributor | null {
    const { candles, policy } = context;
    const window = policy.bucketBaselineBars;

    if (candles.length < window + 1) return null;

    const bar = candles[candles.length - 1];

    /*
     * The baseline sits STRICTLY BEHIND the bar it judges.
     *
     * The recurring bug of this codebase (order blocks, RISK_OFF, volatility
     * expansion): a baseline that includes the event it is measuring. If this
     * bar's volume were in its own average, a genuine 3× spike would drag the
     * mean up and measure itself as smaller than it is.
     */
    const baseline = candles.slice(-(window + 1), -1);
    const sorted = baseline.map((c) => c.volume).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    if (median <= 0) return null;

    const ratio = bar.volume / median;

    /* 1× is normal and worth nothing. 2×+ is real participation. */
    const signal = (ratio - 1) / 1.5;

    return {
      name: "Volume confirmation",
      weight: points(signal, policy.weights.volumeConfirmation),
      source: "MEASURED",
      measured: `volume ${ratio.toFixed(1)}× its ${window}-bar median`,
      note:
        ratio < 0.8
          ? "this move happened on below-average volume — few participants agreed with it"
          : `participation is ${ratio >= 1.5 ? "strong" : "ordinary"}`,
    };
  },
};

/* ── Pattern quality ───────────────────────────────────────────────── */

/**
 * Was there a pattern, and was it a good one?
 *
 * The Pattern Engine already refuses to invent certainty — it returns a quality
 * score, a list of evidence AND a list of weaknesses, and it declines to detect
 * head-and-shoulders at all (ADR-024). This contributor spends those numbers.
 *
 * An unconfirmed pattern — one still waiting on its breakout — is worth strictly
 * less than a confirmed one, and a pattern whose breakout came on no volume is
 * worth less again.
 */
export const patternContributor: IContributor = {
  name: "pattern quality",

  contribute(context): ConfidenceContributor | null {
    const relevant = context.patterns.filter(
      (p) => p.timeframe === context.candidate.timeframe,
    );

    if (relevant.length === 0) return null;

    const best = relevant.reduce((a, b) => (b.quality > a.quality ? b : a));

    let signal = best.quality;
    const caveats: string[] = [];

    if (!best.confirmed) {
      signal *= 0.5;
      caveats.push("not yet confirmed");
    }

    if (best.breakoutPending) {
      signal *= 0.7;
      caveats.push("breakout still pending");
    }

    if (!best.volumeConfirmed) {
      signal *= 0.8;
      caveats.push("no volume behind the break");
    }

    /* Every weakness the detector itself found is a deduction. It knows best. */
    signal -= best.weaknesses.length * 0.1;

    return {
      name: "Pattern quality",
      weight: points(signal, context.policy.weights.patternQuality),
      source: "MEASURED",
      measured: `${best.pattern.toLowerCase().replace(/_/g, " ")}, quality ${best.quality.toFixed(2)}${caveats.length > 0 ? ` (${caveats.join(", ")})` : ""}`,
      note:
        best.weaknesses.length > 0
          ? `the detector itself flagged: ${best.weaknesses.slice(0, 2).join("; ")}`
          : "a clean formation with no flagged weaknesses",
    };
  },
};

/* ── Structure ─────────────────────────────────────────────────────── */

/**
 * Is the trade walking into a wall?
 *
 * A long entered a hair beneath a ceiling the market has rejected three times is
 * being asked to work from the exact price where sellers are waiting. The Risk
 * Engine vetoes the extreme case; this prices the ordinary one.
 *
 * Note this can only ever be a PENALTY. There is no bonus for "no resistance
 * nearby" — that is not evidence of anything, it is the absence of evidence, and
 * paying points for an absence is how a score gets quietly inflated.
 */
export const structureContributor: IContributor = {
  name: "structure",

  contribute(context): ConfidenceContributor | null {
    const factor = context.risk.factors.find((f) => f.name === "structure");
    if (!factor || !factor.available) return null;

    const long = context.candidate.direction === "LONG";
    const entry = context.candidate.entryPrice;

    const walls = context.zones.filter((zone) => {
      if (zone.broken) return false;
      return long
        ? (zone.kind === "RESISTANCE" || zone.kind === "SUPPLY_BLOCK") && zone.low >= entry
        : (zone.kind === "SUPPORT" || zone.kind === "DEMAND_BLOCK") && zone.high <= entry;
    });

    if (walls.length === 0) {
      return {
        name: "Structure",
        weight: 0,
        source: "MEASURED",
        measured: `no ${long ? "resistance" : "support"} between the entry and the target`,
        note: "clear ahead — which is the absence of an obstacle, not a reason to be confident",
      };
    }

    const nearest = walls.reduce((closest, zone) => {
      const a = long ? zone.low - entry : entry - zone.high;
      const b = long ? closest.low - entry : entry - closest.high;
      return a < b ? zone : closest;
    });

    const distance = long ? nearest.low - entry : entry - nearest.high;
    const target = Math.abs(context.candidate.proposedTargets[0] - entry);

    if (target <= 0) return null;

    /*
     * The wall matters in proportion to how much of the intended move it sits
     * inside. A ceiling beyond the target is somebody else's problem.
     */
    const fraction = distance / target;
    if (fraction >= 1) {
      return {
        name: "Structure",
        weight: 0,
        source: "MEASURED",
        measured: `nearest ${nearest.kind} sits beyond the first target`,
        note: "the trade has room to reach its target before meeting resistance",
      };
    }

    const penalty = -(1 - fraction) * (1 + nearest.retests / 5);

    return {
      name: "Structure",
      weight: points(penalty, context.policy.weights.structure),
      source: "MEASURED",
      measured: `${nearest.kind} at ${nearest.low.toFixed(0)}–${nearest.high.toFixed(0)}, ${(fraction * 100).toFixed(0)}% of the way to target, ${nearest.retests} retest(s)`,
      note: `price must pass a level it has turned at ${nearest.retests + 1} time(s) to reach its target`,
    };
  },
};

/* ── Volatility ────────────────────────────────────────────────────── */

/**
 * Is the market behaving like itself?
 *
 * A stop sized for a normal market, placed in a market whose ranges have
 * tripled, is a stop that will be hit by noise. The Risk Engine vetoes the
 * extreme; this prices the rest — and it is a penalty-only contributor for the
 * same reason as structure. Ordinary volatility earns nothing; it is the baseline
 * condition of a tradeable market.
 */
export const volatilityContributor: IContributor = {
  name: "volatility",

  contribute(context): ConfidenceContributor | null {
    const factor = context.risk.factors.find((f) => f.name === "volatility");
    if (!factor || !factor.available) return null;

    const atr = last(context.series.atr);
    if (atr === null || atr <= 0) return null;

    const price = context.candidate.entryPrice;
    const atrPercent = (atr / price) * 100;

    /* Ordinary crypto runs 0.5–2% ATR on the hour. Beyond 3% is disorder. */
    const penalty = atrPercent <= 2 ? 0 : -(atrPercent - 2) / 3;

    return {
      name: "Volatility",
      weight: points(penalty, context.policy.weights.volatility),
      source: "MEASURED",
      measured: `ATR is ${atrPercent.toFixed(2)}% of price`,
      note:
        penalty < 0
          ? "the market is moving more than it usually does — stops sized for normality will be tested by noise alone"
          : "ranges are ordinary for this instrument",
    };
  },
};

/* ── Risk quality ──────────────────────────────────────────────────── */

/**
 * What did the Risk Engine think of the trade's own construction?
 *
 * The stop, the reward, the geometry. This deliberately reads ONLY the factors
 * in `SCOREABLE_RISK_FACTORS` — the ones computable from candles — because the
 * others (spread, book depth, exchange health) do not exist in the historical
 * corpus, and a contributor that is worth points live and structurally absent in
 * the replay would silently invalidate the entire calibration.
 */
export const riskQualityContributor: IContributor = {
  name: "risk quality",

  contribute(context): ConfidenceContributor | null {
    const scoreable = context.risk.factors.filter(
      (f) => f.available && SCOREABLE_RISK_FACTORS.has(f.name),
    );

    if (scoreable.length === 0) return null;

    const heat: Record<string, number> = {
      LOW: 0,
      MODERATE: 0.4,
      ELEVATED: 0.7,
      HIGH: 1,
    };

    const mean =
      scoreable.reduce((sum, f) => sum + (heat[f.rating] ?? 0.5), 0) / scoreable.length;

    /* Low heat is good; the signal is inverted so that a clean trade earns points. */
    const signal = 1 - mean * 2;

    return {
      name: "Risk quality",
      weight: points(signal, context.policy.weights.riskQuality),
      source: "MEASURED",
      measured: `${scoreable.filter((f) => f.rating === "LOW").length} of ${scoreable.length} structural risk factors rated LOW`,
      note: "the trade's own construction — its stop, its reward, its geometry",
    };
  },
};

/* ── Regime fit ────────────────────────────────────────────────────── */

/**
 * Is this the market the strategy was written for?
 *
 * The strategy document names the regimes it wants and the ones it refuses. A
 * mean-reversion strategy firing in a violent trend is not a good trade with a
 * caveat — it is the wrong tool, and the document said so itself.
 */
export const regimeFitContributor: IContributor = {
  name: "regime fit",

  contribute(context): ConfidenceContributor | null {
    const { strategy, market, candidate, policy } = context;
    const regime = market.timeframes[candidate.timeframe]?.direction;

    if (!regime) return null;

    const preferred = strategy.regimes ?? [];
    const avoided = strategy.avoidRegimes ?? [];

    let signal: number;
    let note: string;

    if (avoided.includes(regime)) {
      /*
       * Should be unreachable — the evaluator's regime gate refuses this. It is
       * scored anyway, because a defence that only works when the layer above it
       * works is not a defence.
       */
      signal = -1;
      note = `${strategy.name} declares ${regime} a market to AVOID`;
    } else if (preferred.includes(regime)) {
      signal = 1;
      note = `${regime} is a market ${strategy.name} was written for`;
    } else if (preferred.length === 0) {
      signal = 0;
      note = `${strategy.name} names no preferred regime — it claims to work anywhere, and that claim is untested`;
    } else {
      signal = -0.3;
      note = `${regime} is not among the markets ${strategy.name} names as its own`;
    }

    const supporting = market.timeframes[candidate.timeframe]?.supporting.length ?? 0;
    const contradicting =
      market.timeframes[candidate.timeframe]?.contradicting.length ?? 0;

    return {
      name: "Market regime",
      weight: points(signal, policy.weights.regimeFit),
      source: "MEASURED",
      measured: `${regime} (${supporting} indicator(s) supporting, ${contradicting} contradicting)`,
      note,
    };
  },
};

/* ── Confluence ────────────────────────────────────────────────────── */

/**
 * How many other strategies saw the same thing — and why that is worth ZERO.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The code this platform replaced did exactly this:
 *
 *     confidence = randInt(52, 92) + (strategies.length - 1) * 4
 *
 * Four points per agreeing strategy. Invented. Nobody ever measured whether two
 * strategies agreeing wins more often than one, and the number was chosen because
 * it looked plausible on a chart.
 *
 * ADR-024 §6 is explicit: the uplift is DERIVED FROM THE LEDGER. If Breakout and
 * Level Bounce agreeing historically won 64% against Breakout's 52% alone, the
 * uplift is +12. **Until there is data, the uplift is zero** and the signal says
 * "2 strategies agree — uplift not yet calibrated."
 *
 * So this contributor reports the fact and charges nothing for it. The fact is
 * real and worth telling a trader. The PRICE of the fact is not yet known, and a
 * confluence we cannot price is not a confluence we get to charge for.
 *
 * The policy's coherence check refuses to boot if this weight is ever set above
 * zero without the measurement behind it.
 */
export const confluenceContributor: IContributor = {
  name: "confluence",

  contribute(context): ConfidenceContributor | null {
    const others = context.agreeingStrategies.filter(
      (id) => id !== context.candidate.strategyId,
    );

    if (others.length === 0) return null;

    return {
      name: "Confluence",
      weight: points(1, context.policy.weights.confluence),
      source: "MEASURED",
      measured: `${others.length + 1} strategies agree (${others.join(", ")})`,
      note: "uplift not yet calibrated — no ledger exists to price what agreement is worth, so it is worth nothing (ADR-024 §6)",
    };
  },
};

/**
 * The registry, in the order the breakdown reads.
 *
 * Nothing here is registered by decoration or discovered by reflection: the list
 * is the list, it is greppable, and adding a contributor is a visible edit to a
 * file whose diff a human will read.
 */
export const ALL_CONTRIBUTORS: readonly IContributor[] = [
  regimeFitContributor,
  trendAlignmentContributor,
  momentumContributor,
  volumeContributor,
  patternContributor,
  structureContributor,
  volatilityContributor,
  riskQualityContributor,
  confluenceContributor,
];
