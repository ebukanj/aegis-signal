import { BUILT_IN_STRATEGIES } from "@/constants/strategies";
import { createSeededRandom, pick, randInt } from "@/lib/seeded-random";
import type { LedgerRecord } from "@/features/analytics/types";
import type {
  MarketRegime,
  SignalDirection,
  SignalOutcome,
  Timeframe,
} from "@/types/domain";

/**
 * MOCK LAYER — the signal ledger the backend Analytics module will own.
 *
 * strategies.md (§Cross-Module Systems) mandates a per-module performance
 * ledger: "log for every signal — timestamp, asset, direction, entry/SL/TP,
 * confidence, regime state, outcome in R". Every panel in the Analytics
 * Center is an aggregation of this one table, exactly as it will be
 * server-side. This file and `build-report.ts` are deleted when the API
 * ships; outside the mock layer only `api/analytics-api.ts` may import them.
 *
 * Deterministic by construction (seeded RNG) so the workspace renders
 * identical values on every load — the platform's deterministic-core
 * principle applies to its mocks too.
 */

const EXCHANGES = ["Binance", "Bybit", "OKX", "Bitget", "KuCoin"] as const;

const COINS = [
  "BTC", "ETH", "SOL", "BNB", "XRP", "ADA",
  "AVAX", "LINK", "DOGE", "ARB", "OP", "SUI",
] as const;

/** Trading days covered by the ledger. */
const WINDOW_DAYS = 365;

/** Paper-portfolio starting equity, in quote currency. */
export const STARTING_EQUITY = 10_000;

type StrategyStatus = "ACTIVE" | "PROBATION" | "DISABLED";

/**
 * Per-strategy character. `regimeFit` (0–100) drives both signal frequency and
 * win probability in each regime, which is what makes regime analytics,
 * strategy comparison, and the correlation matrix mutually consistent rather
 * than three unrelated random datasets.
 */
interface StrategySeed {
  timeframes: Timeframe[];
  regimeFit: Partial<Record<MarketRegime, number>>;
  signalsPerWeek: number;
  /** Win rate in ideal conditions, percent. */
  baseWinRate: number;
  /** Average winner, in R. */
  avgWinR: number;
  /** SPOT strategies never emit SHORT. */
  spotOnly?: boolean;
  status?: StrategyStatus;
}

const DEFAULT_FIT = 40;

const STRATEGY_SEEDS: Record<string, StrategySeed> = {
  breakout: {
    timeframes: ["1h", "4h"],
    regimeFit: {
      TRENDING_BULL: 82, TRENDING_BEAR: 70, HIGH_VOLATILITY: 76,
      RANGE: 20, TRANSITION: 45, RISK_OFF: 30,
    },
    signalsPerWeek: 9, baseWinRate: 48, avgWinR: 2.4,
  },
  "trend-pullback": {
    timeframes: ["4h", "1d"],
    regimeFit: {
      TRENDING_BULL: 95, TRENDING_BEAR: 10, HIGH_VOLATILITY: 40,
      RANGE: 35, TRANSITION: 42, RISK_OFF: 12,
    },
    signalsPerWeek: 1.5, baseWinRate: 55, avgWinR: 3.1, spotOnly: true,
  },
  reversal: {
    timeframes: ["1h", "4h"],
    regimeFit: {
      RANGE: 92, TRANSITION: 55, HIGH_VOLATILITY: 35,
      TRENDING_BULL: 28, TRENDING_BEAR: 25, RISK_OFF: 30,
    },
    signalsPerWeek: 6, baseWinRate: 52, avgWinR: 1.5,
  },
  "level-bounce": {
    timeframes: ["15m"],
    regimeFit: {
      RANGE: 78, TRANSITION: 62, HIGH_VOLATILITY: 48,
      TRENDING_BULL: 52, TRENDING_BEAR: 45, RISK_OFF: 35,
    },
    signalsPerWeek: 18, baseWinRate: 66, avgWinR: 0.9,
  },
  "pattern-break": {
    timeframes: ["4h", "1d"],
    regimeFit: {
      TRENDING_BULL: 80, TRANSITION: 70, HIGH_VOLATILITY: 62,
      TRENDING_BEAR: 58, RANGE: 45, RISK_OFF: 28,
    },
    signalsPerWeek: 3.5, baseWinRate: 51, avgWinR: 2.7,
  },
  "crowd-squeeze": {
    timeframes: ["4h", "1d"],
    regimeFit: {
      RANGE: 72, TRANSITION: 68, HIGH_VOLATILITY: 70,
      TRENDING_BULL: 42, TRENDING_BEAR: 50, RISK_OFF: 55,
    },
    signalsPerWeek: 1.8, baseWinRate: 54, avgWinR: 2.6, status: "DISABLED",
  },
};

export const STRATEGY_STATUS: Record<string, StrategyStatus> =
  Object.fromEntries(
    BUILT_IN_STRATEGIES.map((s) => [s.id, STRATEGY_SEEDS[s.id]?.status ?? "ACTIVE"]),
  );

export const LEDGER_EXCHANGES: string[] = [...EXCHANGES];

/* -------------------------------------------------------------------------- */
/* Regime timeline                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The market is in exactly one regime on any given day. Signals inherit the
 * regime of the day they close, so regime performance, the monthly heatmap,
 * and the equity curve all describe the same market history.
 */
const REGIME_SEQUENCE: { regime: MarketRegime; days: number }[] = [
  { regime: "RANGE", days: 34 },
  { regime: "TRENDING_BULL", days: 48 },
  { regime: "HIGH_VOLATILITY", days: 17 },
  { regime: "TRANSITION", days: 21 },
  { regime: "TRENDING_BEAR", days: 39 },
  { regime: "RISK_OFF", days: 14 },
  { regime: "RANGE", days: 42 },
  { regime: "TRANSITION", days: 18 },
  { regime: "TRENDING_BULL", days: 56 },
  { regime: "HIGH_VOLATILITY", days: 22 },
  { regime: "RANGE", days: 29 },
  { regime: "TRENDING_BULL", days: 25 },
];

/** Day offset (0 = oldest day in the window) → regime. */
function buildRegimeTimeline(): MarketRegime[] {
  const timeline: MarketRegime[] = [];
  for (const block of REGIME_SEQUENCE) {
    for (let i = 0; i < block.days && timeline.length < WINDOW_DAYS; i += 1) {
      timeline.push(block.regime);
    }
  }
  // Pad any remainder with the final regime.
  while (timeline.length < WINDOW_DAYS) {
    timeline.push(REGIME_SEQUENCE[REGIME_SEQUENCE.length - 1].regime);
  }
  return timeline;
}

export const REGIME_TIMELINE = buildRegimeTimeline();

/** Midnight UTC of the oldest day in the window. */
export const WINDOW_START = (() => {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  start.setUTCDate(start.getUTCDate() - (WINDOW_DAYS - 1));
  return start;
})();

export function dayOffsetToDate(offset: number): Date {
  const date = new Date(WINDOW_START);
  date.setUTCDate(date.getUTCDate() + offset);
  return date;
}

/* -------------------------------------------------------------------------- */
/* Ledger generation                                                           */
/* -------------------------------------------------------------------------- */

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const round = (value: number, dp = 2) => {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
};

function holdingHoursFor(
  rand: () => number,
  timeframe: Timeframe,
): number {
  switch (timeframe) {
    case "15m":
      return round(0.5 + rand() * 5, 1);
    case "1h":
      return round(4 + rand() * 20, 1);
    case "4h":
      return round(18 + rand() * 60, 1);
    case "1d":
      return round(48 + rand() * 240, 1);
  }
}

function buildStrategyRecords(slug: string): LedgerRecord[] {
  const identity = BUILT_IN_STRATEGIES.find((s) => s.id === slug);
  const seed = STRATEGY_SEEDS[slug];

  // Fail loudly rather than crash a page with `undefined.status`. A missing seed
  // means strategies.ts and this mock have drifted — say which one.
  if (!identity || !seed) {
    throw new Error(
      `No ledger seed for strategy "${slug}" — strategies.ts and mock-ledger.ts have drifted.`,
    );
  }

  const rand = createSeededRandom(
    slug.split("").reduce((acc, ch) => acc + ch.charCodeAt(0) * 131, 977),
  );
  const status = seed.status ?? "ACTIVE";
  const records: LedgerRecord[] = [];

  // Disabled strategies stopped emitting partway through the window — the
  // health monitor benched them. Their history stays in the ledger.
  const lastActiveDay =
    status === "DISABLED" ? Math.floor(WINDOW_DAYS * 0.55) : WINDOW_DAYS;

  const baseDaily = seed.signalsPerWeek / 7;

  for (let day = 0; day < lastActiveDay; day += 1) {
    const regime = REGIME_TIMELINE[day];
    const fit = seed.regimeFit[regime] ?? DEFAULT_FIT;

    // Strategies fire more often in regimes they are built for.
    const expected = baseDaily * (0.45 + fit / 90);
    let count = Math.floor(expected);
    if (rand() < expected - count) count += 1;

    for (let n = 0; n < count; n += 1) {
      const timeframe = pick(rand, seed.timeframes);
      const direction: SignalDirection = seed.spotOnly
        ? "LONG"
        : rand() < (regime === "TRENDING_BEAR" || regime === "RISK_OFF" ? 0.58 : 0.36)
          ? "SHORT"
          : "LONG";

      // Confidence rises with regime fit — the scorer sees what the ledger sees.
      const confidence = clamp(
        Math.round(56 + fit * 0.28 + rand() * 20),
        55,
        97,
      );

      const holdingHours = holdingHoursFor(rand, timeframe);
      const closedAt = dayOffsetToDate(day);
      closedAt.setUTCHours(randInt(rand, 0, 23), randInt(rand, 0, 59), 0, 0);
      const generatedAt = new Date(
        closedAt.getTime() - holdingHours * 3_600_000,
      );

      // ~12% of signals expire before entry; more in hostile regimes.
      const expiryChance = 0.08 + (1 - fit / 100) * 0.12;
      const triggered = rand() > expiryChance;

      if (!triggered) {
        records.push({
          id: `${slug}-${day}-${n}`,
          strategy: slug,
          strategyName: identity.name,
          coin: pick(rand, COINS),
          exchange: pick(rand, EXCHANGES),
          direction,
          timeframe,
          regime,
          confidence,
          generatedAt: generatedAt.toISOString(),
          closedAt: closedAt.toISOString(),
          triggered: false,
          outcome: null,
          returnR: 0,
          returnPct: 0,
          riskPercent: 0,
          holdingHours: 0,
          reachedTp1: false,
          hoursToTarget: null,
        });
        continue;
      }

      // Win probability: strategy's base edge, scaled by regime fit and
      // nudged by confidence. Capped so no strategy looks like a money printer.
      const pWin = clamp(
        (seed.baseWinRate / 100) * (0.6 + fit / 145) + (confidence - 76) / 600,
        0.14,
        0.85,
      );

      const roll = rand();
      const isBreakeven = roll > 0.955; // small band of scratched trades
      const isWin = !isBreakeven && rand() < pWin;

      let outcome: SignalOutcome;
      let returnR: number;
      let reachedTp1: boolean;
      let hoursToTarget: number | null = null;

      if (isBreakeven) {
        outcome = "BREAKEVEN";
        returnR = round((rand() - 0.5) * 0.1, 2);
        reachedTp1 = rand() < 0.5;
      } else if (isWin) {
        outcome = "WIN";
        returnR = round(seed.avgWinR * (0.45 + rand() * 1.2), 2);
        reachedTp1 = true;
        hoursToTarget = round(holdingHours * (0.5 + rand() * 0.45), 1);
      } else {
        outcome = "LOSS";
        // Stops are capped at 1R; a few close early for a partial loss.
        returnR = round(-1 * (0.7 + rand() * 0.32), 2);
        // A loss that never reached TP1 was simply a wrong call — a false positive.
        reachedTp1 = rand() < 0.34;
      }

      const riskPercent = round(0.5 + rand() * 1.0, 2);

      records.push({
        id: `${slug}-${day}-${n}`,
        strategy: slug,
        strategyName: identity.name,
        coin: pick(rand, COINS),
        exchange: pick(rand, EXCHANGES),
        direction,
        timeframe,
        regime,
        confidence,
        generatedAt: generatedAt.toISOString(),
        closedAt: closedAt.toISOString(),
        triggered: true,
        outcome,
        returnR,
        returnPct: round(returnR * riskPercent, 3),
        riskPercent,
        holdingHours,
        reachedTp1,
        hoursToTarget,
      });
    }
  }

  return records;
}

/** The full ledger, ascending by close time. */
export const mockLedger: LedgerRecord[] = BUILT_IN_STRATEGIES.flatMap((s) =>
  buildStrategyRecords(s.id),
).sort(
  (a, b) => new Date(a.closedAt).getTime() - new Date(b.closedAt).getTime(),
);
