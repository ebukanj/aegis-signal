import { indicatorKey } from "@aegis/contracts";
import type { IRiskValidator, RiskContext, Verdict } from "../../domain/validator";
import { at, fmt, last, pct } from "./util";

/* ── Liquidity ─────────────────────────────────────────────────────── */

/**
 * Can this trade actually be taken, and got out of?
 *
 * ── A signal on a market you cannot exit is not a signal ──
 *
 * Thin books are not merely inconvenient. They are where price is *manipulated*: a coin
 * with $200k of daily volume can be walked 8% by one determined participant, which means
 * the beautiful breakout the strategy found may have been manufactured by the person now
 * selling into it.
 *
 * And the exit is worse than the entry. Getting in on a thin book costs slippage; getting
 * out — in a hurry, against the move, with a stop that has just triggered — costs
 * whatever the book says it costs. That price is not in any backtest.
 */
export const liquidityValidator: IRiskValidator = {
  name: "liquidity",
  weight: 0.2,

  validate(context: RiskContext): Verdict {
    const { ticker, book, policy, candidate } = context;

    /*
     * NO TICKER IS A VETO, not an unassessed risk.
     *
     * The distinction the whole engine turns on: a feed that has never been BUILT is
     * declared and does not veto; a feed that EXISTS, is depended on, and has gone dark
     * is a risk signal in itself. We have a ticker feed. If it is not answering, we
     * cannot see the volume, and a trade sized for a liquid market that is not liquid is
     * exactly the trade this gate exists to stop.
     */
    if (!ticker) {
      return {
        kind: "VETO",
        gate: "LIQUIDITY",
        reason:
          "no ticker — the platform cannot see this market's volume, and a trade into an unseen book is a trade into an unknown exit",
      };
    }

    const volume = ticker.quoteVolume24h;

    if (volume < policy.minimumVolumeUsd) {
      return {
        kind: "VETO",
        gate: "LIQUIDITY",
        reason: `24h volume $${(volume / 1e6).toFixed(1)}M is below the $${(policy.minimumVolumeUsd / 1e6).toFixed(0)}M floor — the book is thin enough that the exit moves the price`,
      };
    }

    /*
     * How much of the visible book would this position eat?
     *
     * A position that IS the book is a position whose own exit moves the market against
     * it. The order book gives near-touch depth; the sizing gives notional. If the trade
     * is a meaningful fraction of what is actually resting there, the fill is a fiction.
     */
    if (book) {
      /*
       * Depth within 1% of the touch — which is the RIGHT measure and not merely the one
       * we happen to have.
       *
       * Total book depth is a fiction: it counts orders 15% away that will be pulled long
       * before price reaches them. What matters is what is resting NEAR the price, because
       * that is what a market order actually eats.
       */
      const depth = book.bidDepth1Percent + book.askDepth1Percent;

      if (depth > 0) {
        const risk = Math.abs(candidate.entryPrice - candidate.proposedStop);
        const notional =
          (policy.accountEquity * (context.strategy.riskPercent / 100) * candidate.entryPrice) /
          risk;

        const share = notional / depth;

        if (share > policy.maximumBookShare) {
          return {
            kind: "VETO",
            gate: "LIQUIDITY",
            reason: `this position would be ${(share * 100).toFixed(1)}% of the visible book (limit ${(policy.maximumBookShare * 100).toFixed(0)}%) — the trade would be moving the market it is trying to trade`,
          };
        }
      }
    }

    const rating =
      volume > policy.minimumVolumeUsd * 10
        ? "LOW"
        : volume > policy.minimumVolumeUsd * 3
          ? "MODERATE"
          : "ELEVATED";

    return {
      kind: "PASS",
      rating,
      measured: `24h volume $${(volume / 1e6).toFixed(0)}M`,
      warning:
        rating === "ELEVATED"
          ? `volume is only ${(volume / policy.minimumVolumeUsd).toFixed(1)}× the floor — the exit will be tighter than the entry`
          : undefined,
    };
  },
};

/* ── Spread ────────────────────────────────────────────────────────── */

/**
 * THE GATE MOST PLATFORMS DO NOT HAVE.
 *
 * An edge of 0.3% behind a spread of 0.08% is an edge that is **gone before the trade
 * begins**. You pay the spread on the way in and again on the way out — so a 0.08% spread
 * is a 0.16% tax on a move you hoped would make 0.3%, and more than half the profit was
 * never yours.
 *
 * It never appears in a backtest. Backtests fill at the close, for free, on both sides.
 * It is one of the largest single reasons a strategy that works on paper does not work
 * with money, and the platform is silent about it unless something looks.
 */
export const spreadValidator: IRiskValidator = {
  name: "spread",
  weight: 0.15,

  validate({ book, policy }: RiskContext): Verdict {
    if (!book) {
      /*
       * A VETO, and this one is worth being firm about.
       *
       * The order book feed exists. If it is not answering, the platform cannot see the
       * spread — and approving a trade whose entire profit may already have been eaten by
       * a spread nobody measured is precisely the approval this engine exists to prevent.
       *
       * "We could not check" is not a reason to proceed. It is a reason to stop.
       */
      return {
        kind: "VETO",
        gate: "SPREAD",
        reason:
          "the order book is unavailable — the spread cannot be measured, and an unmeasured spread can eat an entire edge before the trade begins",
      };
    }

    const spread = book.spreadPercent;

    if (spread > policy.maximumSpreadPercent) {
      return {
        kind: "VETO",
        gate: "SPREAD",
        reason: `spread ${pct(spread)} exceeds the ${pct(policy.maximumSpreadPercent, 2)} limit — the edge would be eaten on the way in and again on the way out`,
      };
    }

    const rating =
      spread < policy.maximumSpreadPercent * 0.3
        ? "LOW"
        : spread < policy.maximumSpreadPercent * 0.7
          ? "MODERATE"
          : "ELEVATED";

    return {
      kind: "PASS",
      rating,
      measured: `spread ${pct(spread)} (bid ${fmt(book.bestBid)} / ask ${fmt(book.bestAsk)})`,
      warning:
        rating === "ELEVATED"
          ? `the spread is ${pct(spread)} — a meaningful bite out of the move before it starts`
          : undefined,
    };
  },
};

/* ── Volatility ────────────────────────────────────────────────────── */

/**
 * Is the market behaving like the market the strategy's rules were written for?
 *
 * Two separate questions, and the second is the dangerous one.
 *
 * **The LEVEL.** An instrument whose ATR is 12% of price moves further in a single bar
 * than most trades are trying to capture. Any stop is either inside the noise or so wide
 * the trade is not worth taking. There is no good answer, so there is no trade.
 *
 * **The EXPANSION.** A market that has *always* been volatile can be traded with a wide
 * stop and a small size. A market whose volatility has just **tripled** is a market whose
 * behaviour has changed *since the strategy's conditions were evaluated* — the stop the
 * document proposed was sized for a world that no longer exists, and every historical
 * assumption behind the setup was made in the other one.
 *
 * That second gate is the one that fires during a crash, and it is the one that matters.
 */
export const volatilityValidator: IRiskValidator = {
  name: "volatility",
  weight: 0.15,

  validate(context: RiskContext): Verdict {
    const { candidate, policy } = context;

    const key = indicatorKey({
      indicator: "atr",
      timeframe: candidate.timeframe,
      params: { period: 14 },
    });

    const series = context.indicators[key];
    const atr = last(series);

    if (atr === null) {
      return {
        kind: "VETO",
        gate: "VOLATILITY",
        reason:
          "ATR could not be computed — the platform cannot size a stop against noise it cannot measure",
      };
    }

    const atrPercent = (atr / candidate.entryPrice) * 100;

    if (atrPercent > policy.maximumAtrPercent) {
      return {
        kind: "VETO",
        gate: "VOLATILITY",
        reason: `ATR is ${pct(atrPercent, 2)} of price (limit ${pct(policy.maximumAtrPercent, 1)}) — this instrument moves further in one bar than the trade is trying to capture`,
      };
    }

    /*
     * The expansion, measured against a baseline that sits OUTSIDE the event.
     *
     * Comparing today's ATR to the ATR twenty bars ago fails exactly when it matters:
     * twenty bars into a crash, the "baseline" is already the crash. The Regime Engine
     * learned this the hard way (M06), and the fix is the same — a median, taken from a
     * window that ends well before the present.
     */
    const baseline = medianExcludingRecent(series, 60, 20);

    const expansion = baseline !== null && baseline > 0 ? atr / baseline : null;

    if (expansion !== null && expansion > policy.maximumVolatilityExpansion) {
      return {
        kind: "VETO",
        gate: "VOLATILITY",
        reason: `volatility has expanded ${expansion.toFixed(1)}× above its recent normal (limit ${policy.maximumVolatilityExpansion}×) — the market has changed since this setup was evaluated, and the stop was sized for the old one`,
      };
    }

    const rating =
      expansion === null
        ? "MODERATE"
        : expansion > 1.6
          ? "ELEVATED"
          : expansion < 0.8
            ? "LOW"
            : "MODERATE";

    return {
      kind: "PASS",
      rating,
      measured: `ATR ${pct(atrPercent, 2)} of price${expansion !== null ? `, ${expansion.toFixed(1)}× its recent normal` : ""}`,
      warning:
        expansion !== null && expansion > 1.6
          ? `volatility is ${expansion.toFixed(1)}× its recent normal — size accordingly, the stop will be tested`
          : undefined,
    };
  },
};

/**
 * The median of a window that ENDS before the present.
 *
 * A median rather than a mean, because a mean is dragged upward by the very spike it is
 * being used to detect — it would quietly raise its own bar.
 */
function medianExcludingRecent(
  series: readonly (number | null)[] | undefined,
  window: number,
  gap: number,
): number | null {
  if (!series) return null;

  const end = series.length - gap;
  const start = Math.max(0, end - window);

  if (end <= start) return null;

  const values = series
    .slice(start, end)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);

  if (values.length < 12) return null;

  return values[Math.floor(values.length / 2)];
}

export { at };
