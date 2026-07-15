import { EventEmitter2 } from "@nestjs/event-emitter";
import { describe, expect, it } from "vitest";
import type {
  CandidateSignal,
  ConfidenceReport,
  MarketContext,
  RiskDecision,
} from "@aegis/contracts";

import { DEFAULT_SIGNAL_POLICY, assertSignalPolicyCoherent } from "../signal.policy";
import { assertComplete, type SignalCandidate } from "../domain/intake";
import { ConfluenceEngine } from "../application/confluence/confluence.engine";
import { RankingEngine } from "../application/ranking/ranking.engine";
import { FreshnessService } from "../application/freshness/freshness.service";
import { DeduplicationService } from "../application/deduplication/deduplication.service";
import { PrimeBudgetManager } from "../application/budget/prime-budget.manager";
import { LifecycleManager } from "../application/lifecycle/lifecycle.manager";
import { SignalBuilder } from "../application/publication/signal.builder";
import { PublicationPipeline } from "../application/publication/publication.pipeline";

/* ── Fixtures ──────────────────────────────────────────────────────── */

const HOUR = 3_600_000;
const BAR = new Date("2026-03-01T00:00:00Z").getTime();

function candidate(over: Partial<CandidateSignal> = {}): CandidateSignal {
  return {
    id: `breakout:1:BTC:1h:LONG:${BAR}`,
    strategyId: "breakout",
    strategyVersion: 1,
    rulesHash: "hash-breakout",
    symbol: "BTC",
    exchange: "BINANCE",
    market: "PERPETUAL",
    timeframe: "1h",
    direction: "LONG",
    barTime: BAR,
    evaluatedAt: BAR,
    entryPrice: 60_000,
    proposedStop: 59_000,
    proposedTargets: [63_000, 64_500],
    regime: "TRENDING_BULL",
    explanation: {
      entry: [{ description: "close broke the prior high", outcome: "PASSED", evidence: "60,000 > 59,800" }],
      filters: [],
      regime: { regime: "TRENDING_BULL", allowed: true, reason: "trend up" },
      evidenceUsed: ["highest_high:20:1h"],
    },
    ...over,
  };
}

function risk(over: Partial<RiskDecision> = {}): RiskDecision {
  return {
    approved: true,
    direction: "LONG",
    marketType: "PERPETUAL",
    leverage: {
      suggested: 5,
      maxAllowed: 5,
      liquidationPrice: 52_000,
      liquidationBeforeStop: false,
      liquidationBufferR: 8,
      reason: "5x keeps liquidation well beyond the stop",
    },
    assessment: {
      level: "LOW",
      score: 20,
      factors: [],
      limits: {
        portfolioHeatPercent: 1,
        portfolioHeatCap: 4,
        correlatedPositions: 0,
        correlatedPositionCap: 3,
        openPositions: 0,
      },
      warnings: [],
      unassessed: [],
    },
    decidedAt: new Date(BAR).toISOString(),
    ...over,
  } as RiskDecision;
}

function confidence(over: Partial<ConfidenceReport> = {}): ConfidenceReport {
  return {
    candidateId: `breakout:1:BTC:1h:LONG:${BAR}`,
    strategyId: "breakout",
    confidence: {
      score: 88,
      contributors: [
        { name: "Market regime", weight: 9, source: "MEASURED", measured: "TRENDING_BULL", note: "" },
        { name: "Momentum", weight: 5, source: "MEASURED", measured: "RSI 63", note: "" },
        { name: "Volume confirmation", weight: 6, source: "MEASURED", measured: "2.1× median", note: "" },
        { name: "Pattern quality", weight: 7, source: "MEASURED", measured: "bull flag 0.8", note: "" },
        { name: "Structure", weight: 0, source: "MEASURED", measured: "clear ahead", note: "" },
        { name: "Volatility", weight: 0, source: "MEASURED", measured: "0.6% ATR", note: "" },
        { name: "Risk quality", weight: 6, source: "MEASURED", measured: "5 of 6 LOW", note: "" },
      ],
      basis: "HISTORICAL",
      historicalWinRate: 58,
      historicalSamples: 120,
      liveWinRate: null,
      liveSamples: 0,
      displayedWinRate: 58,
    },
    bucket: "HIGH",
    publishable: true,
    primeEligible: false,
    verdict: "score 88 clears the publication floor",
    calibrationVersion: 1,
    calibrationMethod: "SHRINKAGE",
    similarSetups: 120,
    similarWinRate: 0.58,
    supporting: ["scores in this band won 58% historically"],
    contradicting: [],
    unassessed: ["no live track record yet"],
    at: new Date(BAR).toISOString(),
    ...over,
  };
}

const market: MarketContext = {
  symbol: "BTC",
  timeframes: {},
  alignment: 1,
  conflict: 0,
  primary: "1h",
  at: BAR,
} as MarketContext;

function intake(over: {
  candidate?: Partial<CandidateSignal>;
  risk?: Partial<RiskDecision>;
  confidence?: Partial<ConfidenceReport>;
  now?: number;
} = {}): SignalCandidate {
  const c = candidate(over.candidate);
  return {
    candidate: c,
    risk: risk(over.risk),
    confidence: confidence({ candidateId: c.id, strategyId: c.strategyId, ...over.confidence }),
    market,
    now: over.now ?? BAR + HOUR + 1,
  };
}

function pipeline(): PublicationPipeline {
  return new PublicationPipeline(
    new ConfluenceEngine(),
    new RankingEngine(),
    new FreshnessService(),
    new DeduplicationService(),
    new PrimeBudgetManager(),
    new SignalBuilder(),
  );
}

const emptyLedger = {
  total: 5,
  awarded: 0,
  perSymbol: new Map<string, number>(),
  perStrategy: new Map<string, number>(),
  thisHour: 0,
};

function run(candidates: SignalCandidate[], over: Partial<Parameters<PublicationPipeline["run"]>[0]> = {}) {
  return pipeline().run({
    candidates,
    recent: [],
    ledger: emptyLedger,
    hourStart: BAR,
    ...over,
  });
}

/* ══════════════════════════════════════════════════════════════════════
 *  INTAKE — incompleteness is a BUG, not a rejection
 * ══════════════════════════════════════════════════════════════════════ */

describe("intake refuses incomplete candidates as bugs", () => {
  it("accepts a complete candidate", () => {
    expect(() => assertComplete(intake())).not.toThrow();
  });

  it("THROWS on an unapproved candidate — it should never have reached the publisher", () => {
    expect(() => assertComplete(intake({ risk: { approved: false, gate: "SPREAD", reason: "wide" } }))).toThrow(
      /pipeline BUG/,
    );
  });

  it("THROWS when the confidence report is for a different candidate", () => {
    const i = intake();
    const crossed: SignalCandidate = {
      ...i,
      confidence: { ...i.confidence, candidateId: "someone-else" },
    };
    expect(() => assertComplete(crossed)).toThrow(/crossed with the wrong trade/);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  PUBLICATION RULES & DETERMINISM
 * ══════════════════════════════════════════════════════════════════════ */

describe("publication", () => {
  it("publishes a strong, fresh, coherent candidate", () => {
    const [outcome] = run([intake()]);
    expect(outcome.decision.published).toBe(true);
    expect(outcome.signal).not.toBeNull();
    expect(outcome.signal!.id).toContain("sig:BTC:1h:LONG");
  });

  it("suppresses a below-floor confidence — kept in the scanner, not published", () => {
    const [outcome] = run([
      intake({ confidence: { confidence: { ...confidence().confidence, score: 70 } } }),
    ]);
    expect(outcome.decision.published).toBe(false);
    if (!outcome.decision.published) expect(outcome.decision.gate).toBe("CONFIDENCE_FLOOR");
  });

  it("is DETERMINISTIC — the same batch produces byte-identical signals", () => {
    /*
     * The acceptance criterion that matters most. Deterministic ids, deterministic
     * ranking, no clock read mid-pipeline: two runs of one batch must agree
     * exactly, or a replay of the platform's history could not reproduce it.
     */
    const batch = [
      intake(),
      intake({
        candidate: { id: "trend:1:ETH:1h:LONG:x", strategyId: "trend-pullback", symbol: "ETH", rulesHash: "h2" },
        confidence: { candidateId: "trend:1:ETH:1h:LONG:x", strategyId: "trend-pullback" },
      }),
    ];

    const a = run(batch);
    const b = run(batch);

    expect(JSON.stringify(a.map((o) => o.signal))).toBe(JSON.stringify(b.map((o) => o.signal)));
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  CONFLUENCE — agreement, and fusion of independent strategies
 * ══════════════════════════════════════════════════════════════════════ */

describe("confluence", () => {
  it("fuses two strategies agreeing on the same opportunity into ONE signal", () => {
    /*
     * Two independent plugins, same symbol/direction/timeframe/bar. They must
     * become one signal crediting both — not two notifications for one trade
     * (ADR-021 §1).
     */
    const breakout = intake();
    const levelBounce = intake({
      candidate: {
        id: "level-bounce:1:BTC:1h:LONG:x",
        strategyId: "level-bounce",
        rulesHash: "h-lb",
      },
      confidence: { candidateId: "level-bounce:1:BTC:1h:LONG:x", strategyId: "level-bounce", confidence: { ...confidence().confidence, score: 85 } },
    });

    const outcomes = run([breakout, levelBounce]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].signal!.strategies.sort()).toEqual(["breakout", "level-bounce"]);
    expect(outcomes[0].signal!.rulesHashes).toHaveLength(2);
  });

  it("measures agreement, not confidence — a conflicted market lowers confluence", () => {
    const engine = new ConfluenceEngine();
    const aligned = engine.evaluate(intake(), ["breakout"]);
    const conflicted = engine.evaluate(
      { ...intake(), market: { ...market, alignment: 0.2, conflict: 0.8 } },
      ["breakout"],
    );
    expect(conflicted.score).toBeLessThan(aligned.score);
  });

  it("charges ZERO uplift for agreement until the ledger prices it (ADR-024 §6)", () => {
    const engine = new ConfluenceEngine();
    const report = engine.evaluate(intake(), ["breakout", "level-bounce"]);
    expect(report.uplift).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  DEDUPLICATION
 * ══════════════════════════════════════════════════════════════════════ */

describe("deduplication", () => {
  it("suppresses a near-identical entry already published", () => {
    const outcomes = run([intake()], {
      recent: [{ symbol: "BTC", direction: "LONG", timeframe: "1h", entryPrice: 60_010, barTime: BAR }],
    });
    expect(outcomes[0].decision.published).toBe(false);
    if (!outcomes[0].decision.published) expect(outcomes[0].decision.gate).toBe("DUPLICATE");
  });

  it("does NOT dedup a LONG against a SHORT at the same price — opposite trades", () => {
    const outcomes = run([intake()], {
      recent: [{ symbol: "BTC", direction: "SHORT", timeframe: "1h", entryPrice: 60_000, barTime: BAR }],
    });
    expect(outcomes[0].decision.published).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  FRESHNESS
 * ══════════════════════════════════════════════════════════════════════ */

describe("freshness", () => {
  it("suppresses a stale setup — a signal must not outlive its conditions", () => {
    const [outcome] = run([intake({ now: BAR + HOUR * 6 })]);
    expect(outcome.decision.published).toBe(false);
    if (!outcome.decision.published) expect(outcome.decision.gate).toBe("STALE_DATA");
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  PRIME BUDGET
 * ══════════════════════════════════════════════════════════════════════ */

describe("the prime budget", () => {
  const budget = new PrimeBudgetManager();

  const contender = (over: Partial<Parameters<PrimeBudgetManager["consider"]>[0]> = {}) => ({
    signalId: "sig:1",
    symbol: "BTC",
    strategies: ["breakout"],
    timeframe: "1h",
    score: 80,
    confidenceScore: 92,
    primeEligible: true,
    ...over,
  });

  it("REFUSES Prime to an unproven strategy — today that is everything (ADR-023 §4)", () => {
    const decision = budget.consider(contender({ primeEligible: false }), emptyLedger, DEFAULT_SIGNAL_POLICY);
    expect(decision.primed).toBe(false);
    expect(decision.reason).toMatch(/no settled live record/);
  });

  it("awards a slot to a proven, in-budget contender", () => {
    const decision = budget.consider(contender(), emptyLedger, DEFAULT_SIGNAL_POLICY);
    expect(decision.primed).toBe(true);
    expect(decision.slot).toBe(1);
  });

  it("REFUSES once the daily budget is spent", () => {
    const spent = { ...emptyLedger, awarded: DEFAULT_SIGNAL_POLICY.primeBudget.perDay };
    const decision = budget.consider(contender(), spent, DEFAULT_SIGNAL_POLICY);
    expect(decision.primed).toBe(false);
    expect(decision.reason).toMatch(/budget of \d+ is spent/);
  });

  it("REFUSES a second slot to a symbol already at its cap", () => {
    const capped = { ...emptyLedger, perSymbol: new Map([["BTC", DEFAULT_SIGNAL_POLICY.primeBudget.perSymbol]]) };
    const decision = budget.consider(contender(), capped, DEFAULT_SIGNAL_POLICY);
    expect(decision.primed).toBe(false);
    expect(decision.reason).toMatch(/cannot own the feed/);
  });

  it("the live pipeline primes NOTHING today — nothing is proven", () => {
    /* End to end: a strong, publishable signal, but primeEligible is false, so it
     * publishes and is NOT Prime. The honest state of a platform with no live record. */
    const outcomes = run([intake()]);
    expect(outcomes[0].decision.published).toBe(true);
    expect(outcomes[0].primeSlot).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  RANKING & LIFECYCLE
 * ══════════════════════════════════════════════════════════════════════ */

describe("ranking is deterministic", () => {
  it("orders by total, breaking ties on id — never insertion order", () => {
    const a = { score: { total: 80 } as never, id: "sig:b" };
    const b = { score: { total: 80 } as never, id: "sig:a" };
    /* Same total → the lexicographically smaller id comes first, both ways round. */
    expect(RankingEngine.compare(a, b)).toBeGreaterThan(0);
    expect(RankingEngine.compare(b, a)).toBeLessThan(0);
  });
});

describe("the lifecycle state machine", () => {
  const manager = new LifecycleManager(new EventEmitter2());

  it("allows a legal move", () => {
    expect(manager.canTransition("ACTIVE", "TRIGGERED")).toBe(true);
    expect(manager.canTransition("TRIGGERED", "COMPLETED")).toBe(true);
  });

  it("REFUSES to leave a terminal state — a settled outcome is a matter of record", () => {
    expect(manager.canTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(manager.isTerminal("STOPPED")).toBe(true);
    expect(() => manager.transition("sig:1", "COMPLETED", "ACTIVE", "bug", BAR)).toThrow(/Illegal lifecycle move/);
  });

  it("REFUSES to skip from ACTIVE straight to COMPLETED without triggering", () => {
    /* A trade cannot take profit before it was ever entered. */
    expect(manager.canTransition("ACTIVE", "COMPLETED")).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  POLICY
 * ══════════════════════════════════════════════════════════════════════ */

describe("the signal policy", () => {
  it("boots", () => {
    expect(() => assertSignalPolicyCoherent(DEFAULT_SIGNAL_POLICY)).not.toThrow();
  });

  it("REFUSES a Prime floor beneath the publication floor", () => {
    expect(() =>
      assertSignalPolicyCoherent({ ...DEFAULT_SIGNAL_POLICY, primeConfidenceFloor: 50 }),
    ).toThrow(/SUBSET of published/);
  });

  it("REFUSES a per-scope cap larger than the daily budget", () => {
    expect(() =>
      assertSignalPolicyCoherent({
        ...DEFAULT_SIGNAL_POLICY,
        primeBudget: { ...DEFAULT_SIGNAL_POLICY.primeBudget, perSymbol: 99 },
      }),
    ).toThrow(/never bind/);
  });

  it("REFUSES ranking weights that do not sum to 1", () => {
    expect(() =>
      assertSignalPolicyCoherent({
        ...DEFAULT_SIGNAL_POLICY,
        rankingWeights: { confidence: 0.5, confluence: 0.5, riskQuality: 0.5, freshness: 0.5 },
      }),
    ).toThrow(/sum to/);
  });
});
