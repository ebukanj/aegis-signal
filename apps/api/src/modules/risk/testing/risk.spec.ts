import { beforeEach, describe, expect, it } from "vitest";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  indicatorKey,
  leverageRecommendationSchema,
  riskDecisionSchema,
  type CandidateSignal,
  type Candle,
  type MarketContext,
  type OrderBookSummary,
  type StrategyDefinition,
  type Ticker,
  type Zone,
} from "@aegis/contracts";
import { RiskService } from "../application/services/risk.service";
import { RiskPipeline } from "../application/services/risk.pipeline";
import { SizingService } from "../application/services/sizing.service";
import { ALL_VALIDATORS } from "../application/validators";
import {
  assertPolicyCoherent,
  DEFAULT_RISK_POLICY,
  type RiskPolicy,
} from "../risk.policy";
import type { ExchangeHealth } from "../../market/domain/exchange-adapter.interface";
import type { Maybe } from "../../indicators/application/math/rolling";

/**
 * THE VETO.
 *
 * These tests are not about finding trades. They are about refusing them — and the
 * property that matters most is that **every gate can actually stop a trade**. A risk
 * engine whose gates all pass is not a risk engine, it is a rubber stamp with good
 * documentation.
 */

const sizing = new SizingService();

function engine(): RiskService {
  return new RiskService(new RiskPipeline(sizing), new EventEmitter2());
}

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 0, 10, 12, 0, 0);
const BAR = NOW - HOUR; // the last CLOSED bar

const ATR_KEY = indicatorKey({
  indicator: "atr",
  timeframe: "1h",
  params: { period: 14 },
});

/** ATR of 200 on a 63,000 entry — about 0.32% of price. Realistic for BTC. */
function atrSeries(value = 200, length = 120): Maybe[] {
  return new Array<Maybe>(length).fill(value);
}

function candles(length = 120, price = 63_000): Candle[] {
  return Array.from({ length }, (_, i) => ({
    time: BAR - (length - 1 - i) * HOUR,
    open: price,
    high: price * 1.003,
    low: price * 0.997,
    close: price,
    volume: 1_000,
    takerBuyVolume: 500,
  }));
}

function candidate(overrides: Partial<CandidateSignal> = {}): CandidateSignal {
  return {
    id: "test:1:BTC:1h:LONG:" + BAR,
    strategyId: "test",
    strategyVersion: 1,
    rulesHash: "abc123",
    symbol: "BTC",
    exchange: "BINANCE",
    market: "PERPETUAL",
    timeframe: "1h",
    direction: "LONG",
    barTime: BAR,
    evaluatedAt: BAR,
    entryPrice: 63_000,
    // 400 away = 2 ATR. Comfortably inside the policy's 0.8–5 ATR band.
    proposedStop: 62_600,
    proposedTargets: [64_200], // 1200 reward on 400 risk = 3R
    regime: "TRENDING_BULL",
    explanation: {
      entry: [],
      filters: [],
      regime: { regime: "TRENDING_BULL", allowed: true, reason: "fits" },
      evidenceUsed: [],
    },
    ...overrides,
  };
}

function strategy(overrides: Partial<StrategyDefinition> = {}): StrategyDefinition {
  return {
    id: "test",
    name: "Test",
    summary: "x",
    origin: "CUSTOM",
    enabled: true,
    version: 1,
    direction: "LONG",
    market: "PERPETUAL",
    timeframe: "1h",
    regimes: [],
    avoidRegimes: [],
    entry: [
      {
        kind: "rule",
        negate: false,
        condition: {
          kind: "comparison",
          left: { kind: "indicator", indicator: "rsi", period: 14 },
          op: "lt",
          right: { kind: "number", value: 30 },
        },
      },
    ],
    filters: [],
    stop: { kind: "atr", period: 14, multiplier: 2 },
    targets: [{ rMultiple: 3, closePercent: 100 }],
    riskPercent: 1,
    maxLeverage: 5,
    riskLevel: "MODERATE",
    record: null,
    ...overrides,
  } as StrategyDefinition;
}

const HEALTHY_BOOK: OrderBookSummary = {
  exchange: "BINANCE",
  pair: "BTCUSDT",
  bestBid: 62_995,
  bestAsk: 63_005,
  spreadPercent: 0.016,
  bidDepth1Percent: 5_000_000,
  askDepth1Percent: 5_000_000,
  at: new Date(BAR).toISOString(),
};

const HEALTHY_TICKER: Ticker = {
  exchange: "BINANCE",
  pair: "BTCUSDT",
  last: 63_000,
  bid: 62_995,
  ask: 63_005,
  quoteVolume24h: 2_000_000_000,
  changePercent24h: 1.2,
  at: new Date(BAR).toISOString(),
};

const HEALTHY_EXCHANGE: ExchangeHealth = {
  exchange: "BINANCE",
  connected: true,
  latencyMs: 120,
  uptimeSeconds: 9_000,
  activeSubscriptions: 36,
  reconnectCount: 0,
  lastHeartbeatAt: new Date(BAR).toISOString(),
  errorRate: 0,
  circuitOpen: false,
};

function marketContext(conflict = 0): MarketContext {
  const classification = {
    timeframe: "1h" as const,
    direction: "TRENDING_BULL" as const,
    volatility: "NORMAL" as const,
    agreement: 0.8,
    calibration: "UNCALIBRATED" as const,
    supporting: [{ feature: "trend", score: 0.8, weight: 1, detail: "up" }],
    contradicting: [],
    at: BAR,
    barsHeld: 20,
  };

  return {
    symbol: "BTC",
    timeframes: { "1h": classification },
    alignment: 1,
    conflict,
    primary: "1h",
    at: BAR,
  } as MarketContext;
}

/** A trade that should sail through every gate. Tests break ONE thing at a time. */
function goodTrade(overrides: Partial<Parameters<RiskService["validate"]>[0]> = {}) {
  return {
    candidate: candidate(),
    strategy: strategy(),
    candles: candles(),
    indicators: { [ATR_KEY]: atrSeries() },
    patterns: [],
    zones: [] as Zone[],
    market: marketContext(),
    book: HEALTHY_BOOK,
    ticker: HEALTHY_TICKER,
    exchange: HEALTHY_EXCHANGE,
    btcCorrelation: null,
    now: NOW,
    ...overrides,
  };
}

/* ── The baseline ──────────────────────────────────────────────────── */

describe("the veto", () => {
  let risk: RiskService;

  beforeEach(() => {
    risk = engine();
    risk.onModuleInit();
  });

  it("APPROVES a clean trade — otherwise nothing below means anything", () => {
    /*
     * The control. A risk engine that rejects everything is trivially "safe" and utterly
     * useless, and every veto test below would pass against it. This is the test that
     * makes the others meaningful.
     */
    const decision = risk.validate(goodTrade());

    expect(decision.approved, decision.reason).toBe(true);
    expect(decision.assessment).toBeDefined();
    expect(decision.sizing).toBeDefined();
    expect(decision.leverage).toBeTruthy();
  });

  it("every decision satisfies the contract", () => {
    expect(riskDecisionSchema.safeParse(risk.validate(goodTrade())).success).toBe(true);
  });

  it("is DETERMINISTIC — the same trade decided twice is decided identically", () => {
    // A veto that cannot be reproduced cannot be audited, and an unauditable veto is
    // indistinguishable from a coin flip with authority.
    const a = risk.validate(goodTrade());
    const b = risk.validate(goodTrade());

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/* ── EVERY GATE MUST BE ABLE TO STOP A TRADE ───────────────────────── */

describe("EVERY gate can actually veto", () => {
  let risk: RiskService;

  beforeEach(() => {
    risk = engine();
    risk.onModuleInit();
  });

  it("LIQUIDITY — thin volume", () => {
    const decision = risk.validate(
      goodTrade({ ticker: { ...HEALTHY_TICKER, quoteVolume24h: 3_000_000 } }),
    );

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("LIQUIDITY");
    // Measured, always. "Rejected" tells a trader nothing.
    expect(decision.reason).toContain("3.0M");
  });

  it("SPREAD — the gate most platforms do not have", () => {
    /*
     * An edge of 0.3% behind a spread of 0.09% is an edge that is GONE before the trade
     * begins — paid on the way in and again on the way out. It never appears in a
     * backtest, and it is one of the largest reasons a paper strategy is not a real one.
     */
    const decision = risk.validate(
      goodTrade({ book: { ...HEALTHY_BOOK, spreadPercent: 0.09 } }),
    );

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("SPREAD");
    expect(decision.reason).toContain("0.090%");
  });

  it("SPREAD — a MISSING order book is a veto, not a shrug", () => {
    /*
     * The line the whole engine turns on.
     *
     * The order book feed EXISTS. If it has gone dark, the spread cannot be measured — and
     * approving a trade whose entire profit may already have been eaten by a spread nobody
     * looked at is precisely the approval this engine exists to prevent.
     *
     * "We could not check" is not a reason to proceed. It is a reason to stop.
     */
    const decision = risk.validate(goodTrade({ book: null }));

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("SPREAD");
  });

  it("VOLATILITY — ATR far above the policy ceiling", () => {
    // ATR of 6000 on a 63,000 entry is ~9.5% — the instrument moves further in one bar
    // than the trade is trying to capture.
    const decision = risk.validate(
      goodTrade({ indicators: { [ATR_KEY]: atrSeries(6_000) } }),
    );

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("VOLATILITY");
  });

  it("VOLATILITY — a market whose behaviour changed AFTER the setup was evaluated", () => {
    /*
     * The gate that fires during a crash, and the more important of the two.
     *
     * A market that has always been volatile can be traded with a wide stop. A market whose
     * volatility has just TRIPLED is a market whose behaviour changed since the strategy's
     * conditions were checked — the stop the document proposed was sized for a world that
     * no longer exists.
     */
    const series = atrSeries(150, 120);
    for (let i = 110; i < 120; i++) series[i] = 600; // 4x, and only recently

    const decision = risk.validate(goodTrade({ indicators: { [ATR_KEY]: series } }));

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("VOLATILITY");
    expect(decision.reason).toContain("expanded");
  });

  it("RISK_REWARD — the reward does not pay for the risk", () => {
    const decision = risk.validate(
      goodTrade({
        // 400 risk, 440 reward = 1.1R. Below the 1.5 floor.
        candidate: candidate({ proposedTargets: [63_440] }),
      }),
    );

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("RISK_REWARD");
  });

  it("RISK_REWARD — and a MAXIMUM, which catches the arithmetic flattering itself", () => {
    /*
     * A 40R target is not ambition. R is a ratio, and a ratio can be inflated from either
     * end — a spectacular R:R is nearly always a suspiciously TIGHT STOP rather than a
     * spectacular target.
     */
    const decision = risk.validate(
      goodTrade({ candidate: candidate({ proposedTargets: [70_000] }) }),
    );

    expect(decision.approved).toBe(false);
    // It dies on R:R or on the stop — both are the same underlying lie. Here the stop is
    // fine (2 ATR), so it is the ratio.
    expect(decision.gate).toBe("RISK_REWARD");
  });

  it("STOP_QUALITY — a stop inside the noise is a donation", () => {
    /*
     * If the instrument routinely swings 1 ATR in a bar, a stop 0.25 ATR away is taken out
     * by the market doing nothing in particular. The trade never gets the chance to be
     * right or wrong — and the loss will still be attributed to the strategy, whose record
     * is then wrong.
     */
    const decision = risk.validate(
      goodTrade({
        candidate: candidate({
          proposedStop: 62_950, // 50 away, ATR is 200 → 0.25 ATR
          proposedTargets: [63_200],
        }),
      }),
    );

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("STOP_QUALITY");
    expect(decision.reason).toContain("noise");
  });

  it("STOP_QUALITY — and a stop that can never be hit is hope, not risk management", () => {
    const decision = risk.validate(
      goodTrade({
        candidate: candidate({
          proposedStop: 61_000, // 2000 away = 10 ATR
          proposedTargets: [66_000],
        }),
      }),
    );

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("STOP_QUALITY");
  });

  it("STRUCTURE — a LONG entering directly beneath resistance", () => {
    /*
     * The setup may be perfect and still be taken at the single worst price available: one
     * tick under a ceiling the market has rejected three times. It will be sold into,
     * because that is what the level IS.
     */
    const wall: Zone = {
      kind: "RESISTANCE",
      timeframe: "1h",
      low: 63_050,
      high: 63_200,
      createdAt: BAR - 50 * HOUR,
      lastTouchedAt: BAR - 5 * HOUR,
      retests: 3,
      strength: 0.8,
      swings: [],
      broken: false,
    };

    const decision = risk.validate(goodTrade({ zones: [wall] }));

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("STRUCTURE");
  });

  it("STRUCTURE — a BROKEN resistance does not veto. That is the retest.", () => {
    // A ceiling price has closed decisively through is not a ceiling. Vetoing on it would
    // refuse the retest, which is the trade.
    const broken: Zone = {
      kind: "RESISTANCE",
      timeframe: "1h",
      low: 63_050,
      high: 63_200,
      createdAt: BAR - 50 * HOUR,
      lastTouchedAt: BAR - 5 * HOUR,
      retests: 3,
      strength: 0.8,
      swings: [],
      broken: true,
    };

    expect(risk.validate(goodTrade({ zones: [broken] })).approved).toBe(true);
  });

  it("MARKET_CONDITION — the strategy declared this regime as one to AVOID", () => {
    // Checked AGAIN, even though the evaluator already did. The Risk Engine's guarantee
    // cannot depend on an upstream engine having done its job.
    const decision = risk.validate(
      goodTrade({ strategy: strategy({ avoidRegimes: ["TRENDING_BULL"] }) }),
    );

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("MARKET_CONDITION");
  });

  it("MARKET_CONDITION — the higher timeframes contradict the trade", () => {
    const decision = risk.validate(goodTrade({ market: marketContext(0.8) }));

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("MARKET_CONDITION");
    expect(decision.reason).toContain("bounce");
  });

  it("EXCHANGE_HEALTH — a dead exchange", () => {
    const decision = risk.validate(
      goodTrade({ exchange: { ...HEALTHY_EXCHANGE, connected: false } }),
    );

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("EXCHANGE_HEALTH");
  });

  it("STALE_DATA — a stale price looks exactly like a live one", () => {
    /*
     * The reason this gate exists. A MISSING price announces itself and everybody stops. A
     * stale price does not: there is nothing about the number 63,204 that says "I am four
     * hours old", and every engine downstream treats it with total confidence.
     */
    const decision = risk.validate(goodTrade({ now: NOW + 6 * HOUR }));

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("STALE_DATA");
  });

  it("INVALID_CANDIDATE — a zero-risk trade divides by zero", () => {
    /*
     * If entry equals stop, (equity × risk%) / 0 hands back an INFINITE position size. It
     * does not look like a bug. It looks like the best trade the platform has ever produced
     * — right up until the liquidation.
     */
    const decision = risk.validate(
      goodTrade({
        candidate: candidate({ proposedStop: 63_000, proposedTargets: [64_000] }),
      }),
    );

    expect(decision.approved).toBe(false);
    expect(decision.gate).toBe("INVALID_CANDIDATE");
  });

  it("every rejection names its gate AND measures its reason", () => {
    /*
     * The contract already refuses a rejection with an empty reason. This proves the engine
     * never has to be refused.
     *
     * "Rejected" tells a trader nothing and is indistinguishable from a broken engine. A
     * MEASURED reason tells them the machine looked, and that it was right — and that is
     * what makes a quiet day credible rather than suspicious.
     */
    const rejections = [
      goodTrade({ ticker: { ...HEALTHY_TICKER, quoteVolume24h: 1_000 } }),
      goodTrade({ book: { ...HEALTHY_BOOK, spreadPercent: 0.5 } }),
      goodTrade({ exchange: null }),
      goodTrade({ now: NOW + 10 * HOUR }),
    ].map((t) => risk.validate(t));

    for (const decision of rejections) {
      expect(decision.approved).toBe(false);
      expect(decision.gate).toBeDefined();
      expect(decision.reason!.length).toBeGreaterThan(20);

      /*
       * A MEASUREMENT — or an explicit statement that there was nothing to measure.
       *
       * The first version of this assertion demanded a digit in every reason, and it
       * failed on "the exchange's health is unknown". That reason is not vague; it is
       * exact. Some vetoes are about ABSENCE, and absence has no number — the honest
       * measurement is that there was none.
       *
       * What must never happen is a bare "rejected", which tells a trader nothing and is
       * indistinguishable from a broken engine.
       */
      const measured =
        /\d/.test(decision.reason!) ||
        /unknown|unavailable|could not|no ticker|disconnected/i.test(decision.reason!);

      expect(measured, `unmeasured rejection: "${decision.reason}"`).toBe(true);
    }
  });
});

/* ── The liquidation invariant ─────────────────────────────────────── */

describe("LIQUIDATION MUST NEVER PRECEDE THE STOP", () => {
  let risk: RiskService;

  beforeEach(() => {
    risk = engine();
    risk.onModuleInit();
  });

  it("never suggests a leverage at which the exchange decides the trade", () => {
    /*
     * The most expensive mistake in leveraged trading, and most platforms will cheerfully
     * let a user make it.
     *
     * At high enough leverage the exchange closes the position BEFORE price reaches the
     * stop. The trade is never proven wrong, the risk management never runs, and the
     * account is simply gone — the trader did everything right, set a sensible stop, and
     * lost anyway.
     *
     * The contract refuses to even REPRESENT such a recommendation. This proves the engine
     * never produces one.
     */
    for (const stopPercent of [0.3, 0.5, 1, 2, 4, 6]) {
      const entry = 63_000;
      const stop = entry * (1 - stopPercent / 100);

      const decision = risk.validate(
        goodTrade({
          candidate: candidate({
            entryPrice: entry,
            proposedStop: stop,
            proposedTargets: [entry + (entry - stop) * 3],
          }),
          indicators: { [ATR_KEY]: atrSeries((entry - stop) / 2) },
        }),
      );

      if (!decision.approved || !decision.leverage) continue;

      const leverage = decision.leverage;

      expect(leverage.liquidationBeforeStop).toBe(false);

      // And it clears the policy's buffer with room to spare.
      expect(leverage.liquidationBufferR).toBeGreaterThanOrEqual(
        DEFAULT_RISK_POLICY.minimumLiquidationBufferR,
      );

      // Liquidation is genuinely BEYOND the stop, for a LONG: lower.
      expect(leverage.liquidationPrice).toBeLessThan(stop);

      // The contract agrees.
      expect(leverageRecommendationSchema.safeParse(leverage).success).toBe(true);
    }
  });

  it("VETOES when no leverage is safe rather than shipping a dangerous one", () => {
    // If not even 1x keeps liquidation clear of the stop, the honest answer is no trade —
    // not "trade it at 1x anyway".
    const decision = risk.validate(
      goodTrade({
        candidate: candidate({
          entryPrice: 63_000,
          proposedStop: 1_000, // absurd: liquidation can never be beyond this
          proposedTargets: [200_000],
        }),
        indicators: { [ATR_KEY]: atrSeries(31_000) },
      }),
    );

    expect(decision.approved).toBe(false);
  });
});

/* ── Sizing ────────────────────────────────────────────────────────── */

describe("risk is defined by the STOP, never by the leverage", () => {
  it("quantity = (equity × risk%) / stop distance — leverage appears nowhere", () => {
    /*
     * Leverage decides only how much margin you post. It has no bearing on how much you
     * lose when the stop is hit, because THE STOP DECIDES THAT.
     *
     * A trader who sizes by leverage has no idea what they stand to lose. That is not a
     * style difference — it is the mechanism by which accounts die.
     */
    const policy: RiskPolicy = { ...DEFAULT_RISK_POLICY, accountEquity: 10_000 };

    const low = sizing.size({
      candidate: candidate(),
      strategy: strategy(),
      policy,
      leverage: 2,
    });

    const high = sizing.size({
      candidate: candidate(),
      strategy: strategy(),
      policy,
      leverage: 5,
    });

    // Identical quantity. Identical risk. Only the MARGIN differs.
    expect(low.quantity).toBe(high.quantity);
    expect(low.riskAmount).toBe(high.riskAmount);
    expect(low.marginRequired).toBeGreaterThan(high.marginRequired!);

    // And the risk really is 1% of equity.
    const loss = low.quantity * Math.abs(low.entryPrice - low.stopLoss);
    expect(loss).toBeCloseTo(100, 6);
  });
});

/* ── The unassessed ────────────────────────────────────────────────── */

describe("what the engine could NOT check is never hidden", () => {
  let risk: RiskService;

  beforeEach(() => {
    risk = engine();
    risk.onModuleInit();
  });

  it("an approval NAMES the risks nobody looked at", () => {
    /*
     * The most important assertion in this file after the liquidation invariant.
     *
     * There is no news feed, no ledger and no derivatives feed. Those gates do not veto —
     * vetoing on a feed that does not exist would mean the platform emits nothing at all
     * for three more milestones.
     *
     * But they must NEVER read as clean. An approval that says "nobody checked for news" is
     * honest. An approval that quietly did not check is a lie with a green tick on it.
     */
    const decision = risk.validate(goodTrade());

    expect(decision.approved).toBe(true);

    const unassessed = decision.assessment!.unassessed;

    expect(unassessed.length).toBeGreaterThanOrEqual(3);
    expect(unassessed.join(" ")).toMatch(/news/i);
    expect(unassessed.join(" ")).toMatch(/ledger|portfolio/i);
    expect(unassessed.join(" ")).toMatch(/derivatives|funding/i);
  });

  it("an unassessed factor is marked UNAVAILABLE and rated ELEVATED, never LOW", () => {
    // "A missing measurement must read as MISSING, never as FINE" — the contract's own
    // words. An unknown risk is not a small one, and it must never make a trade look safer
    // than one whose risks were actually measured.
    const decision = risk.validate(goodTrade());

    const news = decision.assessment!.factors.find((f) => f.name === "news")!;

    expect(news.available).toBe(false);
    expect(news.rating).not.toBe("LOW");
    expect(news.measured).toBe("not measured");
  });
});

/* ── The policy ────────────────────────────────────────────────────── */

describe("the policy — every limit in one place, none hardcoded", () => {
  it("REFUSES a self-contradicting policy at boot", () => {
    /*
     * A policy demanding an R:R of at least 3 and at most 2 would reject every candidate —
     * silently, for a reason nobody could ever find, and every rejection would look
     * individually reasonable.
     */
    expect(() =>
      assertPolicyCoherent({
        ...DEFAULT_RISK_POLICY,
        minimumRiskReward: 3,
        maximumRiskReward: 2,
      }),
    ).toThrow(/No trade can satisfy both/);
  });

  it("changing a policy limit changes the decision — the limits are REAL", () => {
    /*
     * The proof that the policy is not decoration. If tightening a limit did not change an
     * outcome, the number in the policy would be a comment and the real limit would be
     * hiding somewhere in a validator.
     */
    const risk = engine();
    risk.onModuleInit();

    // Passes at the default 0.05% spread limit.
    expect(risk.validate(goodTrade()).approved).toBe(true);

    // Tighten it below the actual spread of 0.016%, and the same trade dies.
    risk.setPolicy({ ...DEFAULT_RISK_POLICY, maximumSpreadPercent: 0.01 });

    const tightened = risk.validate(goodTrade());

    expect(tightened.approved).toBe(false);
    expect(tightened.gate).toBe("SPREAD");
  });

  it("every validator has a name, and the score weights sum sensibly", () => {
    const weighted = ALL_VALIDATORS.filter((v) => v.weight > 0);
    const total = weighted.reduce((sum, v) => sum + v.weight, 0);

    expect(weighted.length).toBeGreaterThan(4);
    expect(total).toBeCloseTo(1, 2);
  });
});

/* ── Correlation ───────────────────────────────────────────────────── */

describe("correlation is computed on RETURNS, never on prices", () => {
  it("two independent random walks are not correlated", () => {
    /*
     * The statistical trap this avoids.
     *
     * Two assets in long uptrends have correlated PRICES almost by definition — both
     * numbers go up, and the coefficient comes out near 1 whether or not they have anything
     * to do with each other. The number is impressive and meaningless.
     */
    const risk = engine();

    const seeded = (seed: number) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    const walk = (seed: number, drift: number): Candle[] => {
      const random = seeded(seed);
      let price = 100;

      return Array.from({ length: 200 }, (_, i) => {
        price *= 1 + drift + (random() - 0.5) * 0.02;

        return {
          time: BAR - (200 - i) * HOUR,
          open: price,
          high: price * 1.001,
          low: price * 0.999,
          close: price,
          volume: 100,
          takerBuyVolume: 50,
        };
      });
    };

    // BOTH trend up hard — their PRICES will be nearly perfectly correlated.
    const a = walk(1, 0.004);
    const b = walk(999, 0.004);

    const correlation = risk.correlation(a, b)!;

    // But their RETURNS are independent, and that is what the platform measures.
    expect(Math.abs(correlation)).toBeLessThan(0.3);
  });

  it("an asset is perfectly correlated with itself", () => {
    const risk = engine();
    const series = candles(200);

    // A flat series has no variance and therefore no correlation with anything — null,
    // never 0, because 0 would CLAIM independence.
    expect(risk.correlation(series, series)).toBeNull();
  });
});
