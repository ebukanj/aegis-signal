import { BUILT_IN_STRATEGIES } from "@/constants/strategies";
import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import { mockOpportunities } from "@/features/scanner/data/mock-opportunities";

/**
 * The scan, as evidence.
 *
 * The Scanner's job is not to show pretty counts. It is to prove the machine
 * looked — and, far more importantly, to show **why almost nothing passed**.
 *
 * That is what makes a quiet day believable instead of suspicious. If the
 * platform says "no trades today", a trader is entitled to see the 247 pairs it
 * checked and the specific gate each one failed. Silence without evidence is
 * indistinguishable from a broken feed (AGENTS.md §1).
 */

/** Why a strategy is or is not running right now. */
export type StrategyScanState =
  /** Running against the universe. */
  | "SCANNING"
  /** Deliberately switched off by the regime filter — not broken. */
  | "SUPPRESSED"
  /** Turned off by the user, or missing its data feed. */
  | "DISABLED";

export interface StrategyRun {
  strategy: string;
  state: StrategyScanState;
  /** Present when SUPPRESSED or DISABLED — always say why. */
  stateReason: string | null;
  pairsChecked: number;
  /** Passed the strategy's own entry conditions. */
  candidates: number;
  /** Survived risk validation and reached the signal feed. */
  promoted: number;
}

/** Every gate a candidate can die at. Each one is deterministic. */
export type RejectionGate =
  | "ENTRY_CONDITIONS"
  | "LIQUIDITY"
  | "SPREAD"
  | "CONFIDENCE_FLOOR"
  | "REGIME"
  | "RISK_FLAG"
  | "CORRELATION"
  | "PORTFOLIO_HEAT"
  | "MACRO_WINDOW"
  | "DUPLICATE";

export interface Rejection {
  id: string;
  pair: string;
  exchange: string;
  strategy: string;
  gate: RejectionGate;
  /** The specific measured reason. Never vague. */
  reason: string;
  at: string;
}

export interface ScanRun {
  pairsScanned: number;
  exchanges: number;
  lastScanAt: string;
  nextScanInSeconds: number;
  strategyRuns: StrategyRun[];
  rejections: Rejection[];
  /** Candidates that passed everything and became signals. */
  promoted: number;
}

export const REJECTION_GATE_LABEL: Record<RejectionGate, string> = {
  ENTRY_CONDITIONS: "Entry conditions",
  LIQUIDITY: "Liquidity gate",
  SPREAD: "Spread gate",
  CONFIDENCE_FLOOR: "Confidence floor",
  REGIME: "Regime filter",
  RISK_FLAG: "Risk flag",
  CORRELATION: "Correlation cap",
  PORTFOLIO_HEAT: "Portfolio heat",
  MACRO_WINDOW: "Macro window",
  DUPLICATE: "Duplicate signal",
};

const COINS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "ARB",
  "OP", "SUI", "APT", "NEAR", "TIA", "SEI", "PEPE", "INJ", "LTC", "TON",
];
const EXCHANGES = ["Binance", "Bybit", "OKX", "Bitget", "KuCoin"];

/**
 * Reason templates per gate. Every one cites the measured value against the
 * threshold, because "rejected" without a number is not evidence.
 */
const REASONS: Record<RejectionGate, (r: () => number) => string> = {
  ENTRY_CONDITIONS: (r) =>
    pick(r, [
      `volume ${(0.6 + r() * 0.7).toFixed(1)}× average — needs 1.5×`,
      `RSI ${randInt(r, 32, 52)} — outside the 55–75 momentum band`,
      `close did not clear the 20-bar high (wick only)`,
      `Z-score ${(-1.9 + r() * 0.6).toFixed(1)} — not stretched enough (needs −2.2)`,
      `price never reached the EMA(21) pullback zone`,
    ]),
  LIQUIDITY: (r) =>
    `24h volume $${randInt(r, 6, 47)}M — below the $50M minimum`,
  SPREAD: (r) =>
    `spread ${(0.051 + r() * 0.09).toFixed(3)}% — above the 0.05% limit`,
  CONFIDENCE_FLOOR: (r) =>
    `confidence ${randInt(r, 58, 74)} — below the 75 floor`,
  REGIME: () => `ranging market — Breakout is suppressed here`,
  RISK_FLAG: () =>
    `exploit reported by two tier-1 sources — all signals blocked for 72h`,
  CORRELATION: () =>
    `already 3 open positions correlated above 0.8 to this asset`,
  PORTFOLIO_HEAT: (r) =>
    `open risk ${(4.1 + r() * 0.8).toFixed(1)}% — above the 4% cap`,
  MACRO_WINDOW: (r) => `CPI print in ${randInt(r, 3, 14)} minutes`,
  DUPLICATE: (r) =>
    `same setup already signalled ${randInt(r, 12, 55)} minutes ago`,
};

/** Weighted so the common, boring rejections dominate — as they should. */
const GATE_WEIGHTS: [RejectionGate, number][] = [
  ["ENTRY_CONDITIONS", 58],
  ["CONFIDENCE_FLOOR", 14],
  ["LIQUIDITY", 8],
  ["SPREAD", 6],
  ["REGIME", 4],
  ["DUPLICATE", 3],
  ["CORRELATION", 3],
  ["PORTFOLIO_HEAT", 2],
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

export function getMockScanRun(): ScanRun {
  const rand = createSeededRandom(4242);
  const now = Date.now();

  const promotedTotal = mockOpportunities.filter(
    (o) => o.status !== "WATCHLIST",
  ).length;

  const strategyRuns: StrategyRun[] = BUILT_IN_STRATEGIES.map((strategy) => {
    if (!strategy.enabled) {
      return {
        strategy: strategy.name,
        state: "DISABLED",
        stateReason: "No derivatives feed — funding and open interest unavailable",
        pairsChecked: 0,
        candidates: 0,
        promoted: 0,
      };
    }

    // The regime filter switches strategies off deliberately (ADR-023 §5).
    if (strategy.id === "reversal") {
      return {
        strategy: strategy.name,
        state: "SUPPRESSED",
        stateReason: "Trending market — Reversal only fades inside a range",
        pairsChecked: 0,
        candidates: 0,
        promoted: 0,
      };
    }

    const pairsChecked = randInt(rand, 180, 247);
    const candidates = randInt(rand, 4, 22);
    return {
      strategy: strategy.name,
      state: "SCANNING",
      stateReason: null,
      pairsChecked,
      candidates,
      promoted: Math.min(candidates, randInt(rand, 1, 12)),
    };
  });

  const activeStrategies = strategyRuns
    .filter((s) => s.state === "SCANNING")
    .map((s) => s.strategy);

  const rejections: Rejection[] = Array.from({ length: 40 }, (_, i) => {
    const gate = pickGate(rand);
    return {
      id: `rej-${i}`,
      pair: `${pick(rand, COINS)}USDT`,
      exchange: pick(rand, EXCHANGES),
      strategy: pick(rand, activeStrategies),
      gate,
      reason: REASONS[gate](rand),
      at: new Date(now - randInt(rand, 5, 900) * 1000).toISOString(),
    };
  });

  return {
    pairsScanned: 247,
    exchanges: 5,
    lastScanAt: new Date(now - 42_000).toISOString(),
    nextScanInSeconds: 18,
    strategyRuns,
    rejections,
    promoted: promotedTotal,
  };
}
