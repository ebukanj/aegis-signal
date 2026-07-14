import { Injectable } from "@nestjs/common";
import type {
  MarketRegime,
  RegimeClassification,
  RegimeEvidence,
  Timeframe,
  VolatilityState,
} from "@aegis/contracts";
import { toEvidence, type FeatureInput } from "../../domain/feature";
import { ALL_EXTRACTORS } from "../features/extractors";
import { latest } from "../../domain/feature";
import { REGIME_WEIGHTS, type RegimeWeights } from "../../regime.config";

/**
 * The classifier. A weighted vote, and nothing cleverer.
 *
 * **No machine learning, and that is a decision rather than a limitation.** A model
 * that classified regimes would be unauditable — it could not tell a trader *why*
 * the market is a bear market, only that it is, and this platform's entire promise
 * is that a trader can see why. It would also be untestable against the thing that
 * matters, because (see below) there is nothing to test it against.
 *
 * ── There is no ground truth for a regime, and it changes everything ──
 *
 * Nobody can tell you what regime the market "really" was in on 14 March. There is
 * no oracle, no settlement, no resolved outcome — unlike a signal, which is
 * eventually right or wrong and can be *calibrated*.
 *
 * So the brief's "Probability: 91%" is not merely uncalibrated. It is
 * **unfalsifiable by construction**: it could never be checked, therefore it could
 * never be wrong, therefore it means nothing. It is exactly the 91% this platform
 * already killed once.
 *
 * What can be said honestly is *how much of the evidence agrees*. That is
 * `agreement`, and every ballot comes with it — including the ones that voted the
 * other way.
 */
/**
 * The engine's memory between bars.
 *
 * Kept OUT of `RegimeClassification` deliberately: the pending challenger is an
 * implementation detail of hysteresis, not a fact about the market, and it has no
 * business travelling to the frontend or into a signal.
 */
export interface RegimeState {
  classification: RegimeClassification;
  /** A direction trying to take over, and how many bars it has been trying for. */
  pendingDirection: MarketRegime | null;
  pendingBars: number;
}

@Injectable()
export class RegimeClassifier {
  /**
   * One bar forward. Takes the engine's memory, returns the new memory.
   *
   * The memory is what makes hysteresis possible: a challenger has to keep winning
   * for several bars before it takes the crown, and remembering how long it has been
   * trying requires state the classification itself does not carry.
   */
  step(input: {
    features: FeatureInput;
    timeframe: Timeframe;
    state: RegimeState | null;
    weights?: RegimeWeights;
  }): RegimeState {
    const { classification, candidate } = this.evaluate({
      features: input.features,
      timeframe: input.timeframe,
      previous: input.state?.classification ?? null,
      pending: input.state ?? null,
      weights: input.weights,
    });

    return this.remember(classification, candidate, input.state);
  }

  /**
   * @param previous the last classification, for hysteresis. Null on a cold start.
   * @param pending  the challenger and how long it has been trying, if any.
   */
  classify(input: {
    features: FeatureInput;
    timeframe: Timeframe;
    previous: RegimeClassification | null;
    pending?: RegimeState | null;
    weights?: RegimeWeights;
  }): RegimeClassification {
    return this.evaluate(input).classification;
  }

  /**
   * The vote, the verdict, and — separately — the CANDIDATE the evidence favours.
   *
   * They are not the same thing, and keeping them apart IS hysteresis. `direction` is
   * who currently holds the crown; `candidate` is who is challenging for it. The
   * memory needs both, because without the candidate it cannot count how long a
   * challenger has been winning, and the dwell never advances.
   *
   * The first version returned only the verdict, so `remember` had nothing to
   * remember: the pending counter never incremented, the incumbent could therefore
   * never be replaced, and the engine froze on whatever it decided at its very first
   * bar — reading the entire 2021 bull market as a range. A good illustration of why
   * hysteresis is more than a threshold.
   */
  private evaluate(input: {
    features: FeatureInput;
    timeframe: Timeframe;
    previous: RegimeClassification | null;
    pending?: RegimeState | null;
    weights?: RegimeWeights;
  }): { classification: RegimeClassification; candidate: MarketRegime } {
    const weights = input.weights ?? REGIME_WEIGHTS;
    const { features, timeframe, previous } = input;

    /* ── Collect the ballots ─────────────────────────────────────── */

    const supporting: RegimeEvidence[] = [];
    const contradicting: RegimeEvidence[] = [];

    let weighted = 0;
    let totalWeight = 0;

    const opinions: { name: string; score: number; weight: number; detail: string }[] = [];

    for (const extractor of ALL_EXTRACTORS) {
      const opinion = extractor.extract(features);

      /*
       * A feature that could not see does not vote — and, crucially, its weight is
       * NOT redistributed to the others as though it had agreed with them.
       *
       * `totalWeight` only accumulates for features that actually spoke, so a
       * classification built on two of five features has a correspondingly weak
       * `agreement`. An engine that renormalised here would report total confidence
       * from a market it had barely looked at.
       */
      if (!opinion) continue;

      const weight = weights[extractor.name] ?? 0;
      if (weight <= 0) continue;

      weighted += opinion.score * weight;
      totalWeight += weight;

      opinions.push({
        name: extractor.name,
        score: opinion.score,
        weight,
        detail: opinion.detail,
      });
    }

    const at_ = features.candles.at(-1)?.time ?? 0;

    // Nothing could be seen at all. Not a range, not a trend — unknown.
    if (totalWeight === 0) {
      return {
        classification: {
          timeframe,
          direction: "TRANSITION",
          volatility: this.volatility(features),
          agreement: 0,
          calibration: "UNCALIBRATED",
          supporting: [],
          contradicting: [],
          at: at_,
          barsHeld: 0,
        },
        candidate: "TRANSITION",
      };
    }

    /** −1 … +1. The market's net opinion of itself. */
    const consensus = weighted / totalWeight;

    /* ── The direction ───────────────────────────────────────────── */

    const { direction, candidate } = this.direction({
      consensus,
      features,
      previous,
      pending: input.pending ?? null,
    });

    /*
     * Sort each ballot into "agreed with the verdict" or "argued against it".
     *
     * Note this is done AFTER the verdict, deliberately: a feature is not
     * contradicting in the abstract, it is contradicting *this classification*. In a
     * RANGE, a mildly bullish trend feature is a contradiction; in TRENDING_BULL it
     * is support. The same ballot, read against a different verdict.
     */
    const bullish = direction === "TRENDING_BULL";
    const bearish = direction === "TRENDING_BEAR" || direction === "RISK_OFF";

    for (const opinion of opinions) {
      const evidence = toEvidence(
        opinion.name,
        { score: opinion.score, detail: opinion.detail },
        opinion.weight / totalWeight,
      );

      const agrees = bullish
        ? opinion.score > 0.1
        : bearish
          ? opinion.score < -0.1
          : Math.abs(opinion.score) <= 0.35; // a RANGE is supported by INDIFFERENCE

      if (agrees) supporting.push(evidence);
      else contradicting.push(evidence);
    }

    /* ── Agreement ───────────────────────────────────────────────── */

    /*
     * How unanimous were the voters?
     *
     * Not `|consensus|` — that measures how STRONG the average opinion was, which
     * is a different question and a misleading one. Five features at +0.5 and five
     * split between +1.0 and 0.0 produce the same mean and are not the same market:
     * the first is unanimous, the second is an argument.
     *
     * So agreement is the share of the WEIGHT that landed on the winning side, which
     * is what a trader means when they ask "does everything line up?"
     */
    const supportWeight = supporting.reduce((s, e) => s + e.weight, 0);
    const agreement = clamp01(supportWeight);

    /* ── How long has this held? ─────────────────────────────────── */

    const barsHeld =
      previous && previous.direction === direction ? previous.barsHeld + 1 : 0;

    return {
      classification: {
        timeframe,
        direction,
        volatility: this.volatility(features),
        agreement,
        calibration: "UNCALIBRATED",
        supporting,
        contradicting,
        at: at_,
        barsHeld,
      },
      candidate,
    };
  }

  /** Update the memory: who holds the crown, and who is challenging for it? */
  private remember(
    classification: RegimeClassification,
    candidate: MarketRegime,
    state: RegimeState | null,
  ): RegimeState {
    // The candidate IS the incumbent — nobody is challenging. Clear the field.
    if (candidate === classification.direction) {
      return { classification, pendingDirection: null, pendingBars: 0 };
    }

    /*
     * A challenger is winning the vote but has not yet held out long enough to take
     * the crown. Count the bars it has been making its case — THIS is the counter the
     * dwell reads, and the first version never incremented it.
     */
    const sameChallenger = state?.pendingDirection === candidate;

    return {
      classification,
      pendingDirection: candidate,
      pendingBars: sameChallenger ? (state?.pendingBars ?? 0) + 1 : 1,
    };
  }

  /* ── The direction axis ──────────────────────────────────────────── */

  /**
   * ── HYSTERESIS: a regime that flips every bar is not a regime ──
   *
   * The naive classifier thresholds the consensus and is done. It produces an engine
   * that reads TRENDING_BULL at +0.31, RANGE at +0.29, TRENDING_BULL at +0.31 — three
   * "regime changes" from a market that did nothing, each one publishing an event,
   * each one flipping which strategies are allowed to run.
   *
   * That is not a classifier. It is a random number generator with a threshold.
   *
   * So it takes MORE evidence to leave a regime than it took to enter it: the exit
   * threshold sits below the entry threshold, and the gap between them is the
   * hysteresis band. The market has to actually mean it.
   *
   * This is the single most important thing in this file, and it is the thing that
   * makes `barsHeld` meaningful rather than decorative.
   */
  private direction(input: {
    consensus: number;
    features: FeatureInput;
    previous: RegimeClassification | null;
    pending: RegimeState | null;
  }): { direction: MarketRegime; candidate: MarketRegime } {
    const { consensus, features, previous, pending } = input;

    /*
     * RISK_OFF is checked FIRST, it overrides everything, and it BYPASSES THE DWELL.
     *
     * It is not "a strong bear trend" — it is the market coming apart: volatility
     * exploding while price collapses. TRENDING_BEAR is tradeable (you short the
     * rallies); RISK_OFF is not (the rallies are 8% and they eat you, levels stop
     * holding, and stops fill far from where they were placed).
     *
     * And it must be IMMEDIATE. Making a crash wait three bars for confirmation is
     * three bars too late — that is the entire move. Hysteresis exists to stop the
     * engine chattering, not to make it slow to notice the building is on fire.
     */
    if (this.isRiskOff(features, consensus)) {
      return { direction: "RISK_OFF", candidate: "RISK_OFF" };
    }

    const held = previous?.direction ?? null;

    /*
     * ── THE CANDIDATE ──
     *
     * What the evidence says, right now, with a hysteresis BAND: it takes more
     * consensus to enter a trend than to stay in one.
     */
    const bullThreshold = held === "TRENDING_BULL" ? EXIT_THRESHOLD : ENTER_THRESHOLD;
    const bearThreshold = held === "TRENDING_BEAR" ? -EXIT_THRESHOLD : -ENTER_THRESHOLD;

    /*
     * ── THE TREND-STRENGTH GATE, and it is the thing that was missing ──
     *
     * Consensus tells you WHICH WAY the evidence points. It does not tell you whether
     * there is a trend at all — and those are different questions.
     *
     * The historical replay proved it. With the threshold calibrated so the 2021 bull
     * market was correctly read, the flat mid-2020 chop started reading as a
     * TRENDING_BEAR 67% of the time: consensus wobbled around −0.08, occasionally
     * poked past the entry threshold, and the hysteresis then made the wrong label
     * STICK. Tuning the threshold could not fix both — moving it to catch the trend
     * caught the chop too, and moving it to reject the chop lost the trend.
     *
     * That is the signature of a MISSING FEATURE rather than a mis-set number, and no
     * amount of tuning would ever have found it.
     *
     * ADX is precisely the missing feature. It is the one indicator that measures
     * trend STRENGTH without regard to direction, and across the real periods it
     * separates them cleanly:
     *
     *     2021 bull market      mean ADX 37.9
     *     2022 bear market      mean ADX 42.1
     *     mid-2020 chop         mean ADX 21.9   ← the discriminator
     *
     * So: a market may only ENTER a trend if it can prove there is one. Below ADX 25
     * — the conventional line, and one this data supports — there is a direction but
     * not a trend, which is the exact sentence the trend extractor was already
     * printing while the classifier ignored it.
     *
     * The gate applies to ENTERING only. A trend already underway is not thrown out
     * because ADX dipped; it exits when the evidence turns, which is what the exit
     * threshold is for. Gating the exit too would reintroduce the thrashing.
     */
    const adx = latest(features.indicators["adx"]);
    const proven = adx === null || adx >= TREND_ADX;

    const mayEnterBull = held === "TRENDING_BULL" || proven;
    const mayEnterBear = held === "TRENDING_BEAR" || proven;

    let candidate: MarketRegime;

    if (consensus >= bullThreshold && mayEnterBull) candidate = "TRENDING_BULL";
    else if (consensus <= bearThreshold && mayEnterBear) candidate = "TRENDING_BEAR";
    else {
      /*
       * Neither trending. A RANGE — unless we were just trending, in which case it is
       * a TRANSITION.
       *
       * A market that has ranged for two weeks and a market that fell out of a trend
       * six bars ago look identical to a threshold and are completely different places
       * to trade. Mean reversion works in the first and gets run over in the second,
       * because the trend is not finished with you yet.
       */
      const wasTrending =
        held === "TRENDING_BULL" || held === "TRENDING_BEAR" || held === "RISK_OFF";

      if (wasTrending) candidate = "TRANSITION";
      else if (held === "TRANSITION" && (previous?.barsHeld ?? 0) < TRANSITION_BARS) {
        candidate = "TRANSITION";
      } else candidate = "RANGE";
    }

    if (held === null || candidate === held) {
      return { direction: candidate, candidate };
    }

    /*
     * ── THE DWELL, and this is what the historical replay taught us ──
     *
     * A threshold band alone is not hysteresis. The first version had one — enter at
     * 0.30, exit at 0.18 — and it read the greatest bull market in the asset's history
     * as a bull trend only **27% of the time**, flipping regime 21 times in 136 bars.
     *
     * The reason is that real bull markets pull back, hard and often: 14% of the bars
     * in that run sat more than 10% below their recent peak. Every one of those dips
     * pushed consensus under the exit threshold, and the engine bailed out of the
     * trend — then bailed back in a few bars later. A synthetic "trend" with tidy
     * noise never does that, which is exactly why it never caught this.
     *
     * So a challenger must WIN FOR SEVERAL BARS RUNNING before it takes the crown. One
     * bad bar is not a regime change. It is a bad bar.
     */
    const challengerBars =
      pending?.pendingDirection === candidate ? pending.pendingBars + 1 : 1;

    if (challengerBars >= CONFIRM_BARS) {
      return { direction: candidate, candidate };
    }

    // The incumbent holds. The challenger has to keep making its case.
    return { direction: held, candidate };
  }

  /**
   * RISK_OFF — the market is not trending down, it is coming apart.
   *
   * Volatility expanding hard while price falls hard. This is the shape of a
   * liquidation cascade, and it is the one environment in which essentially every
   * strategy in the platform should stand down: levels do not hold, ranges do not
   * range, and stops are filled far from where they were placed.
   */
  private isRiskOff(features: FeatureInput, consensus: number): boolean {
    const expansion = this.volatilityRatio(features);

    if (expansion === null) return false;
    if (features.candles.length < 10) return false;

    const window = features.candles.slice(-10);
    const move = (window.at(-1)!.close - window[0].close) / window[0].close;

    const violent = expansion >= RISK_OFF_EXPANSION && move <= RISK_OFF_DROP;
    if (!violent) return false;

    /*
     * ── A SHARP DIP IS NOT A COLLAPSE, and the replay caught me confusing them ──
     *
     * The first version needed only two things: volatility expanding hard, and price
     * down 6% in ten bars. Both of those happen REGULARLY inside a healthy bull
     * market — the 2020-21 run had several 20% corrections — and so the engine flagged
     * RISK_OFF on **15% of the greatest bull market in the asset's history**.
     *
     * That is not a cosmetic error. RISK_OFF is the platform's stand-down signal:
     * every strategy goes quiet. The engine would have sat out the best buying
     * opportunities of the entire run, and it would have done so *confidently*.
     *
     * The missing condition is the obvious one in hindsight. A crash is not merely a
     * fast fall — it is a fast fall in a market whose evidence has TURNED. If trend,
     * momentum, volume and structure are still net bullish, price falling hard is a
     * correction, and corrections are where trends refuel.
     *
     * So RISK_OFF requires the weighted evidence to have gone negative as well. That
     * single clause is the difference between standing aside during COVID and
     * standing aside during a dip.
     */
    return consensus < 0;
  }

  /**
   * How violent is the market, relative to its OWN recent normal?
   *
   * ── The baseline must sit OUTSIDE the event it is measuring ──
   *
   * The first version compared today's ATR to the ATR twenty bars ago. It failed to
   * see a crash, and the reason is instructive: twenty bars into a collapse, the
   * "baseline" is *already inside the collapse*. Volatility looked flat, because it
   * was being measured against itself.
   *
   * This is the same trap the Pattern Engine's order block fell into — a threshold
   * measured against a baseline the event had already contaminated.
   *
   * So the baseline is the MEDIAN ATR across a long window, ending well before the
   * present. The median rather than the mean, because a mean is dragged upward by
   * exactly the spike we are trying to detect — it would quietly raise its own bar.
   */
  private volatilityRatio(features: FeatureInput): number | null {
    const series = features.indicators["atr"];
    const current = latest(series);

    if (!series || current === null) return null;

    // The baseline window: BASELINE_BARS of history, ending RECENT_BARS ago so the
    // event under examination cannot vote on its own baseline.
    const end = series.length - RECENT_BARS;
    const start = end - BASELINE_BARS;

    /*
     * ── The baseline ADAPTS to the history available, and this was a real bug ──
     *
     * The first version demanded a full 60-bar baseline ending 20 bars back — 80 bars
     * of ATR before it would say anything at all. Below that it returned null.
     *
     * The COVID crash fixture is 48 daily candles. So during the fastest crash in the
     * asset's history, this function returned NULL on every single bar, RISK_OFF could
     * never evaluate, and the whole mechanism was dead code precisely when it
     * mattered. The historical replay found it; no synthetic test ever would have,
     * because I had given those 400 comfortable bars.
     *
     * It now uses whatever baseline it has, down to a floor below which the question
     * genuinely cannot be answered.
     */
    const baselineStart = Math.max(0, start);

    const baseline = series
      .slice(baselineStart, Math.max(baselineStart + 1, end))
      .filter((v): v is number => v !== null && v > 0)
      .sort((a, b) => a - b);

    if (baseline.length < MINIMUM_BASELINE_BARS) return null;

    const median = baseline[Math.floor(baseline.length / 2)];
    if (median <= 0) return null;

    return current / median;
  }

  /* ── The volatility axis ─────────────────────────────────────────── */

  /**
   * COMPRESSED / NORMAL / EXPANDED — measured against the instrument's OWN history.
   *
   * Never against an absolute threshold. "ATR above 2%" means high volatility on BTC
   * and a quiet afternoon on a memecoin, and a fixed number would classify half the
   * universe as permanently expanded.
   *
   * This axis is orthogonal to direction and both are always true at once. A
   * market can be TRENDING_BULL and EXPANDED — indeed the most dangerous ones are —
   * and the Risk Engine needs the second half to size the position at all.
   */
  private volatility(features: FeatureInput): VolatilityState {
    const ratio = this.volatilityRatio(features);

    // Not enough history to say. NORMAL is the honest default here — unlike the
    // direction axis, "we cannot tell how violent this is" genuinely does mean
    // "treat it as ordinary", because the alternative is to invent a warning.
    if (ratio === null) return "NORMAL";

    if (ratio >= EXPANDED_RATIO) return "EXPANDED";
    if (ratio <= COMPRESSED_RATIO) return "COMPRESSED";

    return "NORMAL";
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * The consensus needed to ENTER a trend.
 *
 * A real trade-off, stated: lower and the engine calls everything a trend; higher
 * and it declares a range in the middle of a bull market. 0.30 means roughly "a
 * clear majority of the weighted evidence points one way".
 */
/**
 * The consensus needed to ENTER a trend — and this number was MEASURED, not chosen.
 *
 * It was 0.30, picked out of the air on the reasoning that "a clear majority of the
 * evidence should point one way". That reasoning was fine and the number was wrong,
 * because I had no idea what scale a weighted mean of five signed features actually
 * produces.
 *
 * The historical replay told me. Across the +493% run of 2020–21 — the strongest bull
 * market this asset has ever had — every single voter was bullish:
 *
 *     trend      +0.33      structure  +0.19
 *     momentum   +0.28      volume     +0.07
 *
 * ...and the weighted consensus was **+0.21**. Not 0.30. The features are signed
 * scores that spend most of their time near the middle even in a raging trend,
 * because most individual bars are unremarkable even inside a great year.
 *
 * A threshold of 0.30 was therefore demanding a market that essentially never
 * happens, and the engine read that bull run as a RANGE 45% of the time. 0.15 is
 * calibrated to the scale the features actually emit.
 *
 * The ranking was never wrong. The unit conversion was.
 */
const ENTER_THRESHOLD = 0.15;

/**
 * Below this ADX, there is a direction but not a trend.
 *
 * 25 is the conventional line and the real data supports it: the 2021 bull ran at a
 * mean ADX of 38, the 2022 bear at 42, and the mid-2020 chop at 22.
 */
const TREND_ADX = 25;

/**
 * A challenger must win this many bars in a row before it takes the crown.
 *
 * The number that fixed the historical replay. One bad bar in a bull market is a bad
 * bar, not a regime change — and a real bull market produces a lot of them.
 */
const CONFIRM_BARS = 4;

/**
 * The consensus needed to STAY in a trend, and it is DELIBERATELY LOW.
 *
 * A trend does not end because it paused; it ends when the evidence turns against it.
 * Staying in until consensus is essentially neutral is not laxness — it is what "the
 * trend is your friend until it isn't" actually means in code.
 */
const EXIT_THRESHOLD = 0.04;

/** After leaving a trend, the market is in TRANSITION for this many bars. */
const TRANSITION_BARS = 8;

/** ATR at 1.8× its normal, while price fell 6% in ten bars. That is not a downtrend. */
const RISK_OFF_EXPANSION = 1.8;
const RISK_OFF_DROP = -0.06;

const EXPANDED_RATIO = 1.5;
const COMPRESSED_RATIO = 0.7;

/**
 * The volatility baseline: 60 bars of history, ending 20 bars ago.
 *
 * The 20-bar gap is what keeps the event out of its own baseline. Without it, a
 * crash measures its violence against a "normal" that is already the crash.
 */
const BASELINE_BARS = 60;
const RECENT_BARS = 20;

/**
 * Below this many baseline bars, "how violent is this, normally?" has no answer.
 *
 * The floor is what lets a short series still get a verdict. The first version
 * demanded the full 80 bars and returned null below them — so on the 48-bar COVID
 * fixture, RISK_OFF was dead code during the fastest crash in the asset's history.
 */
const MINIMUM_BASELINE_BARS = 12;
