import type { FeatureInput, FeatureOpinion, IFeatureExtractor } from "../../domain/feature";
import { at, clamp, latest } from "../../domain/feature";

/**
 * The five voters.
 *
 * Each looks at one aspect of the market and returns a signed opinion. None of them
 * knows what a regime is, what a strategy is, or what the others think — they
 * report what they see and the classifier does the arithmetic.
 *
 * **Every one of them can return `null`.** That is not defensive coding; it is the
 * difference between "the market is balanced" and "I could not see". A classifier
 * that averaged a missing feature in as neutral would build a regime out of
 * features that were never computed, and report it with total confidence.
 */

/* ── Trend ─────────────────────────────────────────────────────────── */

/**
 * TREND — is there a direction, and does it have force behind it?
 *
 * Evidence:      EMA stack (50 vs 200), the slope of the fast EMA, ADX, and the
 *                +DI/−DI balance.
 * Contradiction: price above a rising 200 EMA with an ADX of 12 is not a trend —
 *                it is a drift that happens to be pointing up, and every
 *                trend-following rule on the chart will lose money in it.
 *
 * ── ADX is a MAGNITUDE, never a direction ──
 *
 * A roaring collapse and a roaring rally both print an ADX of 40. Using ADX as
 * though it carried a sign is the classic error, and it produces an engine that
 * calls a crash a strong bull market. So ADX is used only to SCALE the opinion the
 * EMA stack and DI balance have already formed — it is the volume knob, not the
 * song.
 */
export const trendExtractor: IFeatureExtractor = {
  name: "trend",

  extract(input: FeatureInput): FeatureOpinion | null {
    const fast = latest(input.indicators["ema:50"]);
    const slow = latest(input.indicators["ema:200"]);
    const adx = latest(input.indicators["adx"]);
    const plusDi = latest(input.indicators["plus_di"]);
    const minusDi = latest(input.indicators["minus_di"]);
    const close = latest(input.indicators["close"]);

    /*
     * ── IT VOTES WITH WHAT IT HAS, and the historical replay is why ──
     *
     * The first version demanded BOTH EMAs and returned null without them. EMA(200)
     * needs 200 bars. Our BULL_2021 fixture is 196 daily candles.
     *
     * So across the greatest bull market in the asset's history, the heaviest voter
     * on the panel — 30% of the weight — **never voted once**, and the engine read
     * that run as a bull trend only 21% of the time. Nothing errored. Nothing warned.
     * The feature was simply, silently, absent.
     *
     * And it was not a test artefact: ANY daily chart younger than 200 days has this
     * problem, which is every newly listed coin the platform will ever scan.
     *
     * A feature should return null only when it can see NOTHING. When it can see
     * some of the picture, it must say what it sees — and say what it could not.
     */
    const parts: { value: number; weight: number }[] = [];
    const missing: string[] = [];

    let separation: number | null = null;

    // The EMA stack. The strongest single piece of evidence, when it exists.
    if (fast !== null && slow !== null && slow > 0) {
      /*
       * As a FRACTION of price, not "is fast above slow" — a boolean throws away the
       * entire question of BY HOW MUCH. A 50 EMA sitting 0.1% above the 200 is a
       * market with no opinion; one sitting 8% above it has been going one way for
       * months.
       */
      separation = (fast - slow) / slow;
      parts.push({ value: clamp(separation / 0.05, -1, 1), weight: 0.5 });
    } else {
      missing.push("the 200 EMA has not warmed up");
    }

    // Price relative to the fast EMA.
    if (fast !== null && close !== null && fast > 0) {
      parts.push({ value: clamp((close - fast) / fast / 0.03, -1, 1), weight: 0.2 });
    }

    // The DI balance — the honest directional half of the ADX family.
    if (plusDi !== null && minusDi !== null && plusDi + minusDi > 0) {
      parts.push({
        value: clamp((plusDi - minusDi) / (plusDi + minusDi), -1, 1),
        weight: 0.3,
      });
    }

    // Nothing at all. NOW it is honest to say nothing.
    if (parts.length === 0) return null;

    /*
     * Renormalise across the components that DID speak.
     *
     * Note this is the opposite of what the classifier does with absent FEATURES —
     * there, a missing feature must NOT have its weight redistributed, because that
     * would manufacture confidence from a market half-examined. Here it is correct:
     * these are three views of the SAME question, and having two of them is a real
     * (if slightly weaker) answer to it, rather than a different question entirely.
     */
    const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
    const direction =
      parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight;

    /*
     * ADX SCALES it. Below 20 there is no trend, and a trend feature that shouted
     * "bullish!" at an ADX of 12 would be reporting the direction of noise.
     */
    const force = adx === null ? 0.5 : clamp((adx - 15) / 25, 0, 1);

    const score = direction * force;

    const stackText =
      separation !== null
        ? `the 50 EMA is ${separation >= 0 ? "above" : "below"} the 200 by ${(Math.abs(separation) * 100).toFixed(1)}%`
        : `price is ${score >= 0 ? "above" : "below"} its 50 EMA`;

    const caveat = missing.length > 0 ? ` (${missing.join("; ")})` : "";

    const detail =
      adx !== null && adx < 20
        ? `${stackText}, but ADX is only ${adx.toFixed(0)} — there is a direction, not a trend${caveat}`
        : `${stackText} with ADX at ${adx?.toFixed(0) ?? "?"} — the ${score >= 0 ? "up" : "down"}trend has force behind it${caveat}`;

    return { score, detail };
  },
};

/* ── Momentum ──────────────────────────────────────────────────────── */

/**
 * MOMENTUM — how fast, and is it still accelerating?
 *
 * Evidence:      RSI's distance from 50, MACD histogram and its slope, CCI.
 * Contradiction: **momentum that is decelerating while price still rises is the
 *                earliest warning a trend is tiring** — and it is the reason this
 *                feature reads the histogram's SLOPE and not merely its sign.
 *
 * RSI is centred on 50 rather than read against 30/70. "Oversold" is a trade
 * signal, not a market condition: an instrument can sit at RSI 25 for weeks in a
 * bear market, and a regime engine that read that as "about to bounce" would be
 * confusing a strategy's opinion with the market's state.
 */
export const momentumExtractor: IFeatureExtractor = {
  name: "momentum",

  extract(input: FeatureInput): FeatureOpinion | null {
    const rsi = latest(input.indicators["rsi"]);
    const histogram = latest(input.indicators["macd_histogram"]);
    const histogramBefore = at(input.indicators["macd_histogram"], 3);
    const cci = latest(input.indicators["cci"]);

    if (rsi === null && histogram === null && cci === null) return null;

    const parts: number[] = [];

    // RSI, centred. 50 is neutral; 80 and 20 are the practical extremes.
    if (rsi !== null) parts.push(clamp((rsi - 50) / 30, -1, 1));

    // The histogram's sign — is momentum with the move?
    if (histogram !== null && input.candles.length > 0) {
      const price = input.candles.at(-1)!.close;
      parts.push(clamp(histogram / (price * 0.005), -1, 1));
    }

    if (cci !== null) parts.push(clamp(cci / 150, -1, 1));

    if (parts.length === 0) return null;

    const score = parts.reduce((sum, p) => sum + p, 0) / parts.length;

    /*
     * ACCELERATION — the part most engines leave out.
     *
     * Momentum that is fading while price still rises is a trend running on fumes.
     * Reporting only the sign of the histogram would call that "bullish momentum"
     * right up to the reversal.
     */
    const accelerating =
      histogram !== null && histogramBefore !== null
        ? Math.abs(histogram) > Math.abs(histogramBefore)
        : null;

    const fading =
      accelerating === false && Math.sign(score) !== 0
        ? " — but it is FADING, not building"
        : "";

    return {
      score,
      detail: `RSI ${rsi?.toFixed(0) ?? "?"}, MACD histogram ${histogram !== null && histogram >= 0 ? "positive" : "negative"}${fading}`,
    };
  },
};

/* ── Volatility ────────────────────────────────────────────────────── */

/**
 * VOLATILITY — as a DIRECTIONAL feature, which is subtle.
 *
 * The volatility AXIS (compressed/normal/expanded) is classified separately; this
 * is the volatility feature's contribution to the DIRECTION vote, and they are not
 * the same thing.
 *
 * What it contributes: **volatility expanding on the way DOWN is bearish; expanding
 * on the way UP is only mildly bullish.** That asymmetry is real and it is not an
 * opinion — markets fall faster than they rise, panic is more correlated than
 * greed, and a volatility spike is far more often a liquidation cascade than a
 * melt-up. An engine that treated expanding volatility as direction-neutral would
 * miss the single most reliable asymmetry in the asset class.
 */
export const volatilityExtractor: IFeatureExtractor = {
  name: "volatility",

  extract(input: FeatureInput): FeatureOpinion | null {
    const atr = latest(input.indicators["atr"]);
    const atrBefore = at(input.indicators["atr"], 20);
    const bbWidth = latest(input.indicators["bb_width"]);

    if (atr === null || input.candles.length < 5) return null;

    const price = input.candles.at(-1)!.close;
    const recent = input.candles.slice(-10);
    const move = (recent.at(-1)!.close - recent[0].close) / recent[0].close;

    const expanding =
      atrBefore !== null && atrBefore > 0 ? atr / atrBefore : 1;

    let score = 0;
    let detail: string;

    if (expanding > 1.5) {
      // Expanding. The sign of the recent move decides what it MEANS.
      score = move < 0 ? -0.8 : 0.25;

      detail =
        move < 0
          ? `volatility is expanding (ATR up ${((expanding - 1) * 100).toFixed(0)}%) while price falls — this is how liquidation cascades look, not accumulation`
          : `volatility is expanding (ATR up ${((expanding - 1) * 100).toFixed(0)}%) on the way up — real, but expansion cuts both ways`;
    } else if (expanding < 0.7) {
      /*
       * COMPRESSING. Direction-neutral, and honestly so.
       *
       * A squeeze says a move is coming. It does not say which way, and any engine
       * that claims otherwise is guessing. Returning 0 here is not a cop-out — it is
       * the only truthful score, and the volatility AXIS carries the information
       * that actually matters.
       */
      score = 0;
      detail = `volatility is compressing (ATR down ${((1 - expanding) * 100).toFixed(0)}%) — a move is building, but this says NOTHING about which way`;
    } else {
      score = 0;
      detail = `volatility is ordinary (ATR ${((atr / price) * 100).toFixed(2)}% of price${bbWidth !== null ? `, Bollinger width ${(bbWidth * 100).toFixed(1)}%` : ""})`;
    }

    return { score, detail };
  },
};

/* ── Volume ────────────────────────────────────────────────────────── */

/**
 * VOLUME — is anyone actually participating?
 *
 * Evidence:      volume against its own average, the OBV trend, price vs VWAP.
 * Contradiction: **a rally on collapsing volume is the most common false
 *                breakout there is** — price is rising because nobody is selling,
 *                not because anybody is buying, and it comes straight back.
 *
 * This feature is the one most likely to DISSENT from the others, and that is
 * precisely why it is in the vote. Trend, momentum and structure all read price;
 * volume is the only voter reading participation, and when it disagrees with the
 * other four it is usually right.
 */
export const volumeExtractor: IFeatureExtractor = {
  name: "volume",

  extract(input: FeatureInput): FeatureOpinion | null {
    const { candles } = input;
    if (candles.length < 25) return null;

    const obv = latest(input.indicators["obv"]);
    const obvBefore = at(input.indicators["obv"], 10);
    const vwap = latest(input.indicators["vwap"]);

    const recent = candles.slice(-5);
    const baseline = candles.slice(-25, -5);

    const recentVolume =
      recent.reduce((s, c) => s + c.volume, 0) / recent.length;
    const baseVolume =
      baseline.reduce((s, c) => s + c.volume, 0) / Math.max(1, baseline.length);

    if (baseVolume <= 0) return null;

    const relative = recentVolume / baseVolume;
    const priceMove = (recent.at(-1)!.close - recent[0].close) / recent[0].close;

    /*
     * Volume CONFIRMS direction; it does not have one of its own.
     *
     * So the score is the recent price move, amplified when volume showed up and
     * damped — hard — when it did not. A 3% rally on half the normal volume is not
     * a 3% rally; it is an absence of sellers, and it should barely register.
     */
    const participation = clamp((relative - 0.8) / 1.2, -0.5, 1);
    let score = clamp(priceMove / 0.03, -1, 1) * Math.max(0, participation);

    // OBV agreeing or disagreeing with price is the classic confirmation.
    if (obv !== null && obvBefore !== null && obv !== obvBefore) {
      const obvUp = obv > obvBefore;
      const priceUp = priceMove > 0;

      if (obvUp !== priceUp) {
        // They disagree. Halve the conviction — something is off.
        score *= 0.5;
      }
    }

    const aboveVwap = vwap !== null ? recent.at(-1)!.close > vwap : null;

    const detail =
      relative < 0.8
        ? `volume is only ${relative.toFixed(1)}× its recent average — price is moving because nobody is trading, not because anybody is committed`
        : `volume is ${relative.toFixed(1)}× its average and price is ${priceMove >= 0 ? "up" : "down"} ${(Math.abs(priceMove) * 100).toFixed(1)}%${aboveVwap !== null ? `, ${aboveVwap ? "above" : "below"} VWAP` : ""}`;

    return { score, detail };
  },
};

/* ── Structure ─────────────────────────────────────────────────────── */

/**
 * STRUCTURE — what the Pattern Engine already knows.
 *
 * Evidence:      HH/HL vs LH/LL, break of structure, change of character.
 * Contradiction: **a change of character is the loudest dissent this engine can
 *                hear.** It is the first structural crack in a trend, and it
 *                arrives long before any moving average turns — which means it
 *                arrives while every OTHER feature in this vote is still shouting
 *                "trend".
 *
 * This feature consumes the Pattern Engine rather than re-deriving structure, and
 * that is not merely efficient. Two implementations of "is the trend intact" would
 * disagree, and then the regime would be built on a market the Pattern Engine had
 * drawn differently.
 */
export const structureExtractor: IFeatureExtractor = {
  name: "structure",

  extract(input: FeatureInput): FeatureOpinion | null {
    const { structure, patterns } = input;

    if (structure.trend === "UNCLEAR") return null;

    let score =
      structure.trend === "UPTREND"
        ? 0.7
        : structure.trend === "DOWNTREND"
          ? -0.7
          : 0;

    const notes: string[] = [
      structure.trend === "UPTREND"
        ? "higher highs and higher lows — the uptrend is structurally intact"
        : structure.trend === "DOWNTREND"
          ? "lower highs and lower lows — the downtrend is structurally intact"
          : "the highs and lows disagree — there is no trend structure",
    ];

    // A break WITH the trend confirms it.
    if (structure.brokeStructure) {
      score *= 1.3;
      notes.push("and price just broke structure in the trend's direction");
    }

    /*
     * A CHANGE OF CHARACTER FLIPS THE SIGN, and it must.
     *
     * The trend label still says UPTREND — that is what makes a CHoCH valuable and
     * what makes it dangerous. Every other feature is still bullish. Structure is
     * the only voter that can see the first lower low, and if it merely damped its
     * score the engine would keep reporting a bull trend into a reversal.
     */
    if (structure.changedCharacter) {
      score = -score * 0.8;
      notes.push(
        "BUT price has broken a swing AGAINST the trend — the first structural crack, and the earliest warning available",
      );
    }

    const sweep = patterns.find(
      (p) => p.pattern === "LIQUIDITY_SWEEP" && p.quality >= 0.6,
    );

    if (sweep && sweep.direction) {
      score += sweep.direction === "LONG" ? 0.2 : -0.2;
      notes.push(
        `a liquidity sweep took the stops ${sweep.direction === "LONG" ? "below" : "above"} and reclaimed`,
      );
    }

    return {
      score: clamp(score, -1, 1),
      detail: notes.join(", "),
    };
  },
};

export const ALL_EXTRACTORS: IFeatureExtractor[] = [
  trendExtractor,
  momentumExtractor,
  volatilityExtractor,
  volumeExtractor,
  structureExtractor,
];
