import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import { mockOpportunities } from "@/features/scanner/data/mock-opportunities";
import type { Opportunity } from "@/features/scanner/types";

/**
 * The Scanner is a TOOL, not a feed.
 *
 * The distinction matters, and it is easy to get wrong (we did):
 *
 *   SIGNALS  the machine decides. It scans continuously with your enabled
 *            strategies, applies every gate, and hands you the few trades worth
 *            taking. You asked for nothing; it tells you. Passive.
 *
 *   SCANNER  you decide. You pick which strategies to hunt with — including
 *            ones switched off in your normal setup — press Scan, and get a
 *            ranked list, best first. Active.
 *
 * The rejections still matter: they are what makes a thin result set credible
 * rather than suspicious. But they are the *evidence under the result*, not the
 * page itself.
 */

export type RejectionGate =
  | "ENTRY_CONDITIONS"
  | "LIQUIDITY"
  | "SPREAD"
  | "CONFIDENCE_FLOOR"
  | "MARKET_CONDITION"
  | "RISK_FLAG"
  | "CORRELATION"
  | "PORTFOLIO_HEAT"
  | "MACRO_WINDOW"
  | "DUPLICATE";

export const REJECTION_GATE_LABEL: Record<RejectionGate, string> = {
  ENTRY_CONDITIONS: "Entry conditions",
  LIQUIDITY: "Liquidity",
  SPREAD: "Spread",
  CONFIDENCE_FLOOR: "Confidence floor",
  MARKET_CONDITION: "Market condition",
  RISK_FLAG: "Risk flag",
  CORRELATION: "Correlation cap",
  PORTFOLIO_HEAT: "Portfolio heat",
  MACRO_WINDOW: "Macro window",
  DUPLICATE: "Duplicate",
};

export interface Rejection {
  id: string;
  pair: string;
  strategy: string;
  gate: RejectionGate;
  /** The measured value against the threshold. Never vague. */
  reason: string;
}

/** What the user asks the scanner to do. */
export interface ScanRequest {
  /** Strategy names to hunt with. Never empty. */
  strategies: string[];
  market: "ALL" | "SPOT" | "PERPETUAL";
  exchange: string;
}

export interface ScanResult {
  request: ScanRequest;
  pairsChecked: number;
  exchangesChecked: number;
  durationMs: number;
  /** Ranked best-first. At most 10 — a scanner that returns 200 rows is a feed. */
  ranked: Opportunity[];
  rejections: Rejection[];
  ranAt: string;
}

const COINS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "ARB",
  "OP", "SUI", "APT", "NEAR", "TIA", "SEI", "PEPE", "INJ", "LTC", "TON",
];

const REASONS: Record<RejectionGate, (r: () => number) => string> = {
  ENTRY_CONDITIONS: (r) =>
    pick(r, [
      `volume ${(0.6 + r() * 0.7).toFixed(1)}× average — needs 1.5×`,
      `RSI ${randInt(r, 32, 52)} — outside the 55–75 band`,
      `close did not clear the 20-bar high (wick only)`,
      `Z-score ${(-1.9 + r() * 0.6).toFixed(1)} — not stretched enough (needs −2.2)`,
      `price never reached the pullback zone`,
    ]),
  LIQUIDITY: (r) => `24h volume $${randInt(r, 6, 47)}M — below the $50M minimum`,
  SPREAD: (r) =>
    `spread ${(0.051 + r() * 0.09).toFixed(3)}% — above the 0.05% limit`,
  CONFIDENCE_FLOOR: (r) => `confidence ${randInt(r, 58, 74)} — below the 75 floor`,
  MARKET_CONDITION: () => `sideways market — breakouts are traps here`,
  RISK_FLAG: () => `exploit reported — all signals blocked for 72h`,
  CORRELATION: () => `already 3 open positions correlated above 0.8`,
  PORTFOLIO_HEAT: (r) => `open risk ${(4.1 + r() * 0.8).toFixed(1)}% — above the 4% cap`,
  MACRO_WINDOW: (r) => `CPI print in ${randInt(r, 3, 14)} minutes`,
  DUPLICATE: (r) => `same setup already signalled ${randInt(r, 12, 55)} min ago`,
};

const GATE_WEIGHTS: [RejectionGate, number][] = [
  ["ENTRY_CONDITIONS", 60],
  ["CONFIDENCE_FLOOR", 14],
  ["LIQUIDITY", 8],
  ["SPREAD", 6],
  ["MARKET_CONDITION", 4],
  ["DUPLICATE", 3],
  ["CORRELATION", 2],
  ["PORTFOLIO_HEAT", 1],
  ["MACRO_WINDOW", 1],
  ["RISK_FLAG", 1],
];

function pickGate(r: () => number): RejectionGate {
  const total = GATE_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  let roll = r() * total;
  for (const [gate, weight] of GATE_WEIGHTS) {
    roll -= weight;
    if (roll <= 0) return gate;
  }
  return "ENTRY_CONDITIONS";
}

/**
 * Run the scan the user asked for.
 *
 * Deterministic: the same request always produces the same result, so the page
 * is reproducible while the backend does not exist.
 */
export function runMockScan(request: ScanRequest): ScanResult {
  const seed = request.strategies.join("").length * 977 + request.market.length;
  const rand = createSeededRandom(seed);

  const ranked = mockOpportunities
    .filter((o) => o.status !== "WATCHLIST")
    .filter((o) => request.strategies.some((s) => o.strategies.includes(s)))
    .filter((o) => request.market === "ALL" || o.marketType === request.market)
    .filter((o) => request.exchange === "ALL" || o.exchange === request.exchange)
    .sort((a, b) => b.confidence - a.confidence || b.rewardRisk - a.rewardRisk)
    .slice(0, 10)
    .map((o, i) => ({ ...o, rank: i + 1 }));

  const rejections: Rejection[] = Array.from({ length: 24 }, (_, i) => {
    const gate = pickGate(rand);
    return {
      id: `rej-${i}`,
      pair: `${pick(rand, COINS)}USDT`,
      strategy: pick(rand, request.strategies),
      gate,
      reason: REASONS[gate](rand),
    };
  });

  const pairsChecked = 247;

  return {
    request,
    pairsChecked,
    exchangesChecked: request.exchange === "ALL" ? 5 : 1,
    durationMs: randInt(rand, 2400, 5200),
    ranked,
    rejections,
    ranAt: new Date().toISOString(),
  };
}
