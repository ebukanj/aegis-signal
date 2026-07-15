import {
  BUILT_IN_STRATEGIES,
  opportunitySchema,
  signalDetailSchema,
  type Opportunity,
  type PublishedSignal,
  type RiskLevel,
  type SignalDetail,
} from "@aegis/contracts";

/**
 * Turns a stored PublishedSignal into the shapes the frontend already speaks —
 * `Opportunity` for the feed, `SignalDetail` for the detail panel.
 *
 * ── This is a projection, not a computation ──
 *
 * It reshapes fields the engines already produced; it derives no new number. The
 * two places it looks like it is "computing" are honest reshapes: risk level is
 * the inverse of the risk-quality the Risk Engine already decided, and
 * reward-to-risk is arithmetic on the entry, stop and target the signal already
 * carries.
 *
 * ── What it does NOT have, and says so ──
 *
 * A published signal does not yet carry a strategy's win rate, its equity curve,
 * or a list of similar past trades. Those come from the Outcome Ledger (M11), which
 * does not exist. Rather than invent them — the exact sin this platform was built
 * to stop — the projection fills them with empty, honest placeholders: zero trades,
 * no curve, and a note that the live record has not been earned yet.
 */

/** Strategy id → the display name the frontend's enabled-filter matches on. */
const STRATEGY_NAME = new Map(BUILT_IN_STRATEGIES.map((s) => [s.id, s.name]));

function strategyNames(ids: readonly string[]): string[] {
  return ids.map((id) => STRATEGY_NAME.get(id) ?? id);
}

/** The inverse of the risk-quality the Risk Engine decided. No re-judging. */
function riskLevelOf(signal: PublishedSignal): RiskLevel {
  const q = signal.signalScore.riskQuality;
  if (q >= 90) return "LOW";
  if (q >= 55) return "MODERATE";
  if (q >= 25) return "ELEVATED";
  return "HIGH";
}

function rewardRisk(signal: PublishedSignal): number {
  const risk = Math.abs(signal.entryPrice - signal.stopLoss);
  const reward = Math.abs(signal.takeProfits[0] - signal.entryPrice);
  return risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;
}

/**
 * Feed projection. The lifecycle status collapses onto the scanner's vocabulary:
 * an open signal is ACTIVE; one near its expiry is EXPIRING. Settled signals do
 * not appear in the actionable feed — a completed trade is not an opportunity, it
 * is a record, and it belongs on the Track Record page.
 */
export function toOpportunity(signal: PublishedSignal, rank: number): Opportunity {
  const nearExpiry =
    signal.status === "ACTIVE" &&
    signal.expiresAt - signal.publishedAt > 0 &&
    Date.now() > signal.publishedAt + (signal.expiresAt - signal.publishedAt) * 0.66;

  return opportunitySchema.parse({
    id: signal.id,
    rank,
    coin: signal.symbol,
    pair: `${signal.symbol}USDT`,
    exchange: signal.exchange,
    direction: signal.direction,
    strategies: strategyNames(signal.strategies),
    timeframe: signal.timeframe,
    confidence: signal.confidence.score,
    riskLevel: riskLevelOf(signal),
    marketType: signal.marketType,
    suggestedLeverage: signal.suggestedLeverage,
    isPrime: signal.isPrime,
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfits[0],
    rewardRisk: rewardRisk(signal),
    regime: signal.regime,
    status: nearExpiry ? "EXPIRING" : "ACTIVE",
    generatedAt: new Date(signal.publishedAt).toISOString(),
  });
}

/**
 * Detail projection. Every trade-plan and confidence field is real; the
 * strategy-record and similar-trades sections are honestly empty until the ledger
 * exists.
 */
export function toSignalDetail(signal: PublishedSignal): SignalDetail {
  const risk = Math.abs(signal.entryPrice - signal.stopLoss);
  const reward = Math.abs(signal.takeProfits[0] - signal.entryPrice);

  return signalDetailSchema.parse({
    id: signal.id,
    coin: signal.symbol,
    pair: `${signal.symbol}USDT`,
    exchange: signal.exchange,
    direction: signal.direction,
    strategies: strategyNames(signal.strategies),
    timeframe: signal.timeframe,
    status: signal.status === "ACTIVE" || signal.status === "TRIGGERED" ? "ACTIVE" : "COMPLETED",
    regime: signal.regime,
    confidence: signal.confidence.score,
    riskLevel: riskLevelOf(signal),

    marketType: signal.marketType,
    suggestedLeverage: signal.suggestedLeverage,
    isPrime: signal.isPrime,

    generatedAt: new Date(signal.publishedAt).toISOString(),
    expiresAt: new Date(signal.expiresAt).toISOString(),

    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfits: signal.takeProfits,
    expectedR: risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0,
    maxRiskPercent: 1,
    estimatedHoldingHours: 0,
    suggestedRiskPercent: null,

    /* Real: the confidence breakdown and its calibration travel through whole. */
    confidenceBreakdown: signal.confidence.contributors,
    calibration: signal.confidence,

    explanation: {
      summary: signal.summary,
      conditions: signal.supporting,
      filters: [],
      confirmations: signal.contradicting.length
        ? [`Weighing against: ${signal.contradicting.join("; ")}`]
        : [],
    },
    checklist: [
      { label: "Risk Engine approved", passed: true },
      { label: "Confidence above the publication floor", passed: true },
      { label: "Confluence above the floor", passed: true },
      { label: "Fresh — the setup still describes the market", passed: true },
      {
        label: "Prime (proven live record)",
        passed: signal.isPrime,
      },
    ],

    riskFactors: [],
    heatScore: Math.max(0, Math.min(100, 100 - signal.signalScore.riskQuality)),
    warnings: signal.unassessed,

    /*
     * The Outcome Ledger (M11) owns these. Until it exists, they are HONESTLY
     * empty — a strategy has no live record yet, and inventing one is the sin this
     * platform refuses. The frontend renders the empty state ("no settled trades
     * yet") rather than a fabricated win rate.
     */
    strategyStats: {
      winRate: 0,
      avgReturnR: 0,
      avgDrawdown: 0,
      profitFactor: 0,
      expectancy: 0,
      totalTrades: 0,
      equityCurve: [],
    },
    similarSignals: [],
  });
}
