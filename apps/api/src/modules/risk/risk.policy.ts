import { z } from "zod";

/**
 * THE POLICY. Every limit the Risk Engine enforces, in one place.
 *
 * The brief is emphatic: *"Policies must be externalized. Never hardcode limits."* It is
 * right, and the reason is not configurability for its own sake.
 *
 * A threshold buried in a validator is a threshold nobody can audit. When the platform
 * rejects a trade for a spread of 0.081%, a trader is entitled to see the number it was
 * measured against — and an operator is entitled to change it without a deploy. A limit
 * that only exists inside an `if` is a limit that will one day be different from the one
 * the documentation claims.
 *
 * ── Every number here is a TRADE-OFF, and each is stated ──
 *
 * There is no "correct" minimum R:R. There is only a choice about what kind of platform
 * this is, and each field below says what the choice costs.
 */
export const riskPolicySchema = z.object({
  /* ── Account ─────────────────────────────────────────────────────── */

  /**
   * The account the sizing is stated FOR.
   *
   * There is no user account until Milestone 11, and a position size without an equity
   * is not a position size — it is a percentage pretending to be an answer. So the
   * policy carries a reference equity, every sizing says what it assumed, and the number
   * is honest because it declares its own basis.
   *
   * When Users lands, this comes from the trader's settings and exactly one line changes.
   */
  accountEquity: z.number().positive(),

  /* ── Liquidity ───────────────────────────────────────────────────── */

  /**
   * Minimum 24h quote volume, in USD.
   *
   * Below this the book is thin enough that a retail-sized order moves the price against
   * itself — and thin books are where price is *manipulated*, not merely traded. The
   * signal might be perfect; the fill will not be.
   *
   * Set too high and the platform only ever trades majors. Set too low and it ships
   * beautiful signals on coins nobody can get out of.
   */
  minimumVolumeUsd: z.number().positive(),

  /**
   * Maximum share of the order book's near-touch depth a position may consume.
   *
   * A position that IS the book is a position whose exit moves the market. 5% means the
   * trade is a passenger rather than the driver.
   */
  maximumBookShare: z.number().positive().max(1),

  /* ── Spread ──────────────────────────────────────────────────────── */

  /**
   * Maximum bid/ask spread, as a percent of price.
   *
   * **The gate most platforms do not have, and the one that quietly eats returns.** An
   * edge of 0.3% behind a spread of 0.08% is an edge that is *gone before the trade
   * begins* — you pay it on the way in and again on the way out. It never appears in a
   * backtest, and it is the difference between a strategy that works on paper and one
   * that works.
   */
  maximumSpreadPercent: z.number().positive(),

  /* ── Volatility ──────────────────────────────────────────────────── */

  /**
   * Maximum ATR as a percent of price.
   *
   * Above this the instrument routinely moves further in one bar than the entire trade
   * is trying to capture. Any stop is either inside the noise or so wide the trade is
   * not worth taking.
   */
  maximumAtrPercent: z.number().positive(),

  /**
   * Maximum volatility EXPANSION — current ATR against its own recent normal.
   *
   * Distinct from the level, and the more dangerous of the two. A market that has always
   * been volatile can be traded with a wide stop. A market whose volatility has just
   * TRIPLED is a market whose behaviour has changed *since the strategy's rules were
   * evaluated*, and the stop the document proposed was sized for a world that no longer
   * exists.
   */
  maximumVolatilityExpansion: z.number().positive(),

  /* ── Risk / reward ───────────────────────────────────────────────── */

  /**
   * Minimum reward-to-risk on the FIRST target.
   *
   * The first target, not the last — because the last one is a hope and the first is the
   * one that actually gets hit. A platform that justified a trade on a 6R runner it
   * reaches once in twenty attempts is a platform doing arithmetic on a fantasy.
   *
   * 1.5 is the floor. Below it a strategy must win more than 40% of the time simply to
   * break even after fees, and **no strategy in this platform has yet earned the right
   * to claim any win rate at all** (ADR-024). Demanding a real edge is the only honest
   * position while every record is still null.
   */
  minimumRiskReward: z.number().positive(),

  /**
   * Maximum reward-to-risk. Yes, a MAXIMUM.
   *
   * A 40R target is not ambition, it is a stop placed so close to entry that the ratio
   * flatters itself. The R multiple is a ratio, and a ratio can be inflated from either
   * end — a suspiciously beautiful R:R is nearly always a suspiciously tight stop.
   *
   * This is the gate that catches the arithmetic looking better than the trade.
   */
  maximumRiskReward: z.number().positive(),

  /* ── Stop quality ────────────────────────────────────────────────── */

  /**
   * Minimum stop distance, in ATR.
   *
   * **A stop inside the noise is not a stop. It is a donation.** If the instrument
   * routinely swings 1 ATR in a bar, a stop at 0.4 ATR is taken out by the market doing
   * nothing in particular — the trade never gets a chance to be right or wrong, and the
   * loss is not information about the strategy.
   */
  minimumStopAtr: z.number().positive(),

  /**
   * Maximum stop distance, in ATR.
   *
   * A stop 8 ATR away technically "cannot be hit by noise" — because it cannot be hit by
   * anything short of the thesis being comprehensively wrong, by which point the loss is
   * enormous. A stop that never triggers is not risk management, it is hope with a
   * price attached.
   */
  maximumStopAtr: z.number().positive(),

  /* ── Structure ───────────────────────────────────────────────────── */

  /**
   * How close to a resistance zone a LONG may enter, as a percent of price.
   *
   * Entering a LONG one tick under a ceiling the market has rejected three times is
   * taking the trade at the single worst price available. The setup may be real; it is
   * being asked to work from the exact spot where sellers are waiting.
   */
  minimumDistanceToStructurePercent: z.number().positive(),

  /* ── Leverage ────────────────────────────────────────────────────── */

  /**
   * How far liquidation must sit BEYOND the stop, in units of risk (R).
   *
   * If liquidation sits closer than the stop, the stop is decoration — the exchange
   * closes the position before the trade is even proven wrong. The contract refuses to
   * represent such a recommendation at all (`liquidationBeforeStop`), and this is the
   * buffer that keeps it comfortably away rather than merely on the right side of the
   * line.
   *
   * 1.5R means: the market must go 50% further against you than your own stop before the
   * exchange takes the decision out of your hands.
   */
  minimumLiquidationBufferR: z.number().positive(),

  /** Hard ceiling on suggested leverage, whatever the strategy asks for. */
  maximumLeverage: z.number().int().positive(),

  /* ── Freshness ───────────────────────────────────────────────────── */

  /**
   * How stale the evidence may be, in bars.
   *
   * A candidate evaluated on a bar that closed three bars ago is a candidate about a
   * market that has moved on. **Stale data is worse than no data**, because a stale price
   * looks exactly like a live one — there is nothing about it that says "I am old".
   */
  maximumEvidenceAgeBars: z.number().int().positive(),

  /** Maximum exchange round-trip latency before the feed is considered unhealthy. */
  maximumExchangeLatencyMs: z.number().int().positive(),

  /* ── Correlation ─────────────────────────────────────────────────── */

  /**
   * Above this, an altcoin is simply a leveraged bet on BTC.
   *
   * Not a rejection on its own — it is a WARNING, and a loud one. Most of crypto is
   * correlated to BTC most of the time, and vetoing everything above 0.8 would veto the
   * asset class. But a trader taking five "independent" positions that are all really the
   * same BTC bet is taking one position at five times the size, and does not know it.
   *
   * It becomes a rejection once there is a portfolio to be concentrated in — which needs
   * the ledger (M11).
   */
  correlationWarningThreshold: z.number().min(0).max(1),

  /* ── Scope ───────────────────────────────────────────────────────── */

  allowedExchanges: z.array(z.string()).min(1),
  allowedTimeframes: z.array(z.string()).min(1),
});
export type RiskPolicy = z.infer<typeof riskPolicySchema>;

/**
 * The default policy.
 *
 * Deliberately CONSERVATIVE, and the reason is the platform's first principle: *a missed
 * trade is acceptable; a bad trade is not.* Every threshold here errs toward silence,
 * because silence costs an opportunity and a bad trade costs money — and those are not
 * symmetric.
 */
export const DEFAULT_RISK_POLICY: RiskPolicy = {
  accountEquity: 10_000,

  minimumVolumeUsd: 20_000_000,
  maximumBookShare: 0.05,

  maximumSpreadPercent: 0.05,

  maximumAtrPercent: 8,
  maximumVolatilityExpansion: 2.5,

  minimumRiskReward: 1.5,
  maximumRiskReward: 12,

  minimumStopAtr: 0.8,
  maximumStopAtr: 5,

  minimumDistanceToStructurePercent: 0.5,

  minimumLiquidationBufferR: 1.5,
  maximumLeverage: 5,

  maximumEvidenceAgeBars: 2,
  maximumExchangeLatencyMs: 5_000,

  correlationWarningThreshold: 0.85,

  allowedExchanges: ["BINANCE", "BYBIT"],
  allowedTimeframes: ["15m", "1h", "4h", "1d"],
};

/**
 * A policy that contradicts itself is worse than no policy — it produces decisions that
 * are individually defensible and collectively impossible, and nobody can see why.
 *
 * Checked at boot, where it is free.
 */
export function assertPolicyCoherent(policy: RiskPolicy): void {
  if (policy.minimumRiskReward >= policy.maximumRiskReward) {
    throw new Error(
      `The risk policy demands an R:R of at least ${policy.minimumRiskReward} and at most ` +
        `${policy.maximumRiskReward}. No trade can satisfy both, so every candidate would be ` +
        `rejected — silently, and for a reason nobody would ever find.`,
    );
  }

  if (policy.minimumStopAtr >= policy.maximumStopAtr) {
    throw new Error(
      `The risk policy demands a stop of at least ${policy.minimumStopAtr} ATR and at most ` +
        `${policy.maximumStopAtr} ATR. Nothing can satisfy both.`,
    );
  }

  if (policy.accountEquity <= 0) {
    throw new Error(
      "The reference equity must be positive — a position size divided by zero equity is not a number",
    );
  }
}
