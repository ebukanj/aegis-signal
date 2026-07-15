import type { Timeframe } from "@aegis/contracts";

/**
 * Every limit the Signal Engine is allowed to enforce.
 *
 * Same discipline as the Risk and Confidence policies, and for the same reason: a
 * threshold buried in an `if` is a threshold nobody can audit. When the platform
 * publishes four signals and suppresses twenty-three, a trader is entitled to see
 * the numbers that made that call — and an operator is entitled to change them
 * without a deploy.
 *
 * ── The single most important number in this file ──
 *
 * `primeBudget.perDay`. Prime is scarce ON PURPOSE (ADR-021 §2): roughly 4–5 a
 * day, delivered whenever conditions are met, NOT a feed of everything. The whole
 * product thesis is precision over quantity — *"is this one of the few
 * opportunities worthy of interrupting the trader?"* — and this number is that
 * thesis, expressed as an integer.
 */
export interface SignalPolicy {
  /* ── Publication gates ─────────────────────────────────────────── */

  /**
   * The confidence SCORE floor for publication. Real evidence from day one
   * (M09 gates on the score, not the calibrated rate).
   *
   * A signal below this is not published — it stays inspectable in the scanner as
   * an explored-but-not-published opportunity, so the evidence is never hidden,
   * but it does not reach the feed.
   */
  readonly publishConfidenceFloor: number;

  /**
   * The CONFLUENCE floor for publication.
   *
   * Confidence asks "has this kind of setup won before?"; confluence asks "does
   * the evidence agree with itself right now?". A publishable signal needs both —
   * a well-calibrated score on a setup where half the indicators point the other
   * way is a coin flip wearing a track record.
   */
  readonly publishConfluenceFloor: number;

  /* ── Prime ─────────────────────────────────────────────────────── */

  readonly primeBudget: {
    /** The day's elite slots. ADR-021 default 5. */
    readonly perDay: number;
    /** No more than this from one symbol — one coin cannot own the day. */
    readonly perSymbol: number;
    /** No more than this from one strategy — diversity of thesis. */
    readonly perStrategy: number;
    /** A burst limit, so a single volatile hour cannot spend the whole day. */
    readonly perHour: number;
  };

  /**
   * The confidence floor a signal must ALSO clear to be eligible for Prime.
   *
   * ADR-021 §2 default ≥88. This is stricter than the publication floor: everything
   * Prime is published, but not everything published is Prime. Prime is the subset
   * the platform is willing to interrupt a trader for.
   */
  readonly primeConfidenceFloor: number;

  /* ── Freshness ─────────────────────────────────────────────────── */

  /**
   * How many bars of its own timeframe a candidate may age before the setup it
   * describes is considered gone. A signal must never outlive the market
   * conditions that created it.
   */
  readonly maximumAgeBars: number;

  /* ── Deduplication ─────────────────────────────────────────────── */

  readonly dedupe: {
    /**
     * Two entries within this fraction of each other (as a % of price) are "the
     * same entry zone" and the two candidates are duplicates. A LONG at 60,000 and
     * a LONG at 60,020 are not two opportunities; they are one, seen twice.
     */
    readonly entryZonePercent: number;
    /** Duplicates must also fall within this many bars of each other. */
    readonly withinBars: number;
  };

  /* ── Confluence grouping ───────────────────────────────────────── */

  /**
   * Candidates on the same symbol + direction + timeframe whose bars fall within
   * this window are considered to be about the SAME opportunity, and are fused —
   * this is how ≥2 independent strategies agreeing become one signal (ADR-021 §1).
   */
  readonly confluenceWindowBars: number;

  /* ── Ranking weights (for the backstage ordering score only) ───── */

  readonly rankingWeights: {
    readonly confidence: number;
    readonly confluence: number;
    readonly riskQuality: number;
    readonly freshness: number;
  };
}

const BARS_PER_TIMEFRAME_DAY: Record<Timeframe, number> = {
  "15m": 96,
  "1h": 24,
  "4h": 6,
  "1d": 1,
};

export const DEFAULT_SIGNAL_POLICY: SignalPolicy = {
  publishConfidenceFloor: 85,
  publishConfluenceFloor: 55,

  primeBudget: {
    perDay: 5,
    perSymbol: 2,
    perStrategy: 2,
    perHour: 2,
  },
  primeConfidenceFloor: 88,

  maximumAgeBars: 2,

  dedupe: {
    entryZonePercent: 0.25,
    withinBars: 3,
  },

  confluenceWindowBars: 2,

  rankingWeights: {
    confidence: 0.4,
    confluence: 0.3,
    riskQuality: 0.2,
    freshness: 0.1,
  },
};

/**
 * A policy that contradicts itself would suppress everything, silently, for a
 * reason nobody could find — and every individual suppression would look
 * reasonable. Refused at boot, exactly as the Risk and Confidence policies are.
 */
export function assertSignalPolicyCoherent(policy: SignalPolicy): void {
  const fail = (why: string): never => {
    throw new Error(`Incoherent signal policy: ${why}`);
  };

  if (policy.primeConfidenceFloor < policy.publishConfidenceFloor) {
    fail(
      `primeConfidenceFloor (${policy.primeConfidenceFloor}) sits below the publication floor (${policy.publishConfidenceFloor}) — ` +
        `Prime would then include signals not fit to publish, and Prime is a SUBSET of published, never an exception to it`,
    );
  }

  const b = policy.primeBudget;
  if (b.perDay <= 0) {
    fail("the daily Prime budget is zero — the platform could never interrupt a trader, which is not scarcity, it is silence");
  }
  if (b.perSymbol > b.perDay || b.perStrategy > b.perDay || b.perHour > b.perDay) {
    fail(
      "a per-scope Prime cap exceeds the daily budget — a sub-limit that can never bind is a limit that does not exist",
    );
  }

  const weights = Object.values(policy.rankingWeights).reduce((a, w) => a + w, 0);
  if (Math.abs(weights - 1) > 1e-9) {
    fail(`ranking weights sum to ${weights.toFixed(3)}, not 1 — the ordering score would not be bounded to 0–100`);
  }

  for (const w of Object.values(policy.rankingWeights)) {
    if (w < 0) fail("a ranking weight is negative — a stronger factor would lower the score");
  }

  if (policy.maximumAgeBars < 0) fail("maximumAgeBars is negative — a signal cannot be fresher than the bar it fired on");
  if (policy.confluenceWindowBars < 0) fail("confluenceWindowBars is negative");
}

/** How many bars of a timeframe fit in a calendar day. Used for daily caps. */
export function barsPerDay(timeframe: Timeframe): number {
  return BARS_PER_TIMEFRAME_DAY[timeframe];
}
