/**
 * The official strategy roster — single source of truth for strategy
 * identity across the frontend. Derived from `strategies.md` (Strategy
 * Module Specifications v1.0); the backend strategy plugins must register
 * with these exact slugs.
 */

export type StrategyMarket = "FUTURES" | "SPOT" | "BOTH" | "META";

export interface StrategyIdentity {
  slug: string;
  name: string;
  /** Edge class, e.g. "Momentum Breakout". */
  className: string;
  market: StrategyMarket;
  /** One-sentence objective, condensed from strategies.md. */
  objective: string;
  /** Whether it emits directional scanner opportunities. */
  directional: boolean;
}

export const STRATEGY_ROSTER: StrategyIdentity[] = [
  {
    slug: "ignition",
    name: "Ignition",
    className: "Momentum Breakout",
    market: "FUTURES",
    objective:
      "Captures the expansion leg after a volatility squeeze, entering on a confirmed range breakout with volume ignition.",
    directional: true,
  },
  {
    slug: "tidewater",
    name: "Tidewater",
    className: "Trend Accumulation",
    market: "SPOT",
    objective:
      "Accumulates strong assets in confirmed uptrends, buying pullbacks to the moving-average zone and exiting only on structural trend failure.",
    directional: true,
  },
  {
    slug: "rubber-band",
    name: "Rubber Band",
    className: "Mean Reversion",
    market: "FUTURES",
    objective:
      "Fades statistically overextended moves back to the mean in ranging regimes — the regime-complement of Ignition.",
    directional: true,
  },
  {
    slug: "sniper",
    name: "Sniper",
    className: "S/R Scalping",
    market: "FUTURES",
    objective:
      "High-frequency, small-target scalps off algorithmically mapped support/resistance levels on the 15-minute chart.",
    directional: true,
  },
  {
    slug: "oracle",
    name: "Oracle",
    className: "Social & Fundamental Intelligence",
    market: "BOTH",
    objective:
      "Detects information edges from social, news, on-chain and developer activity before they are priced in — always gated by technical confirmation.",
    directional: true,
  },
  {
    slug: "flush",
    name: "Flush",
    className: "Liquidation Reversal",
    market: "FUTURES",
    objective:
      "Trades the snap-back after forced-liquidation cascades, when price reverts once forced flow is exhausted.",
    directional: true,
  },
  {
    slug: "crowded-boat",
    name: "Crowded Boat",
    className: "Funding & OI Squeeze",
    market: "FUTURES",
    objective:
      "Positions against extreme, persistent crowd positioning when funding is stretched, open interest is bloated, and price stops progressing.",
    directional: true,
  },
  {
    slug: "relay",
    name: "Relay",
    className: "Relative-Strength Rotation",
    market: "SPOT",
    objective:
      "Keeps capital in whatever is strongest — rotating between BTC, ETH, majors and stables by relative-strength ranking.",
    directional: true,
  },
  {
    slug: "harvest",
    name: "Harvest",
    className: "Delta-Neutral Funding Carry",
    market: "BOTH",
    objective:
      "Earns funding-rate yield with near-zero price exposure (spot long + perp short) — the platform's income module.",
    directional: false,
  },
  {
    slug: "killzone",
    name: "Killzone",
    className: "Session Liquidity",
    market: "FUTURES",
    objective:
      "Exploits session structure: the Asian range and its London/New York resolution, trading the liquidity sweep before the true move.",
    directional: true,
  },
  {
    slug: "chameleon",
    name: "Chameleon",
    className: "Adaptive Meta-Engine",
    market: "META",
    objective:
      "Detects the market regime, ranks all modules by live expectancy in that regime, allocates the risk budget to the leaders, and de-risks when conditions turn hostile.",
    directional: false,
  },
];

/** Strategies that emit directional scanner opportunities. */
export const DIRECTIONAL_STRATEGIES = STRATEGY_ROSTER.filter(
  (s) => s.directional,
);

/** Spot-only strategies never emit SHORT or leveraged signals. */
export const SPOT_ONLY_STRATEGY_NAMES = STRATEGY_ROSTER.filter(
  (s) => s.market === "SPOT",
).map((s) => s.name);

export function strategyBySlug(slug: string): StrategyIdentity | undefined {
  return STRATEGY_ROSTER.find((s) => s.slug === slug);
}

export function strategyByName(name: string): StrategyIdentity | undefined {
  return STRATEGY_ROSTER.find((s) => s.name === name);
}
