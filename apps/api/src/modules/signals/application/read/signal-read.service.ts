import { Injectable } from "@nestjs/common";
import type {
  MarketRegime,
  Opportunity,
  RiskLevel,
  SignalDetail,
} from "@aegis/contracts";
import { SignalRepository } from "../../infrastructure/repository/signal.repository";
import { toOpportunity, toSignalDetail } from "./signal.read-model";
import { timeframeMs } from "../../../indicators/application/services/timeframe.resolver";

export interface SignalFeed {
  context: {
    regime: MarketRegime;
    riskLevel: RiskLevel;
    pairsScanned: number;
    exchanges: number;
    strategiesActive: number;
    lastScanAt: string;
    published: number;
  };
  prime: Opportunity[];
  validated: Opportunity[];
}

/**
 * The read side of the Signal Engine — what the frontend consumes.
 *
 * The write side (the pipeline) decides what to publish; this projects what WAS
 * published into the shapes the UI speaks. It is deliberately separate: a read is
 * a different concern from a decision, and keeping them apart means the feed can
 * never accidentally publish, re-rank, or re-score anything. It only reads.
 */
@Injectable()
export class SignalReadService {
  constructor(private readonly repository: SignalRepository) {}

  /**
   * The feed — the platform's published signals, newest first.
   *
   * A published signal ranked by its own backstage score, split into the two tiers
   * that are the whole product (ADR-021): PRIME, the few the platform will
   * interrupt you for, and everything else that passed but did not earn a slot.
   * Today Prime is empty — nothing is proven — and an empty Prime tier is the
   * honest state, not a bug.
   */
  async feed(now: number): Promise<SignalFeed> {
    const since = now - timeframeMs("1d") * 400;
    /*
     * OPEN signals only. A settled trade is not an opportunity — it is a record,
     * and it belongs on the Track Record page, not in the actionable feed. This is
     * also what makes the feed LIVE: when the Settlement Worker advances a signal to
     * a terminal state, it drops out of this query, and the socket nudge tells the
     * browser to refetch — so a missed or stopped signal leaves the feed on its own.
     */
    const signals = await this.repository.recent({
      since,
      statuses: ["ACTIVE", "TRIGGERED"],
      limit: 200,
    });

    const ranked = [...signals].sort((a, b) => {
      if (b.signalScore.total !== a.signalScore.total) {
        return b.signalScore.total - a.signalScore.total;
      }
      return a.id < b.id ? -1 : 1;
    });

    const opportunities = ranked.map((s, i) => toOpportunity(s, i + 1));

    return {
      context: {
        regime: dominantRegime(signals.map((s) => s.regime)),
        riskLevel: dominantRisk(opportunities.map((o) => o.riskLevel)),
        pairsScanned: new Set(signals.map((s) => s.symbol)).size,
        exchanges: new Set(signals.map((s) => s.exchange)).size,
        strategiesActive: new Set(signals.flatMap((s) => s.strategies)).size,
        lastScanAt: new Date(now).toISOString(),
        published: signals.length,
      },
      prime: opportunities.filter((o) => o.isPrime),
      validated: opportunities.filter((o) => !o.isPrime),
    };
  }

  /** One signal, with its rank-neighbours for prev/next navigation. */
  async detail(
    id: string,
    now: number,
  ): Promise<{ detail: SignalDetail; prevId: string | null; nextId: string | null } | null> {
    const signal = await this.repository.byId(id);
    if (!signal) return null;

    /* Neighbours in the same ranked feed, so prev/next matches what the list shows. */
    const since = now - timeframeMs("1d") * 400;
    const all = (await this.repository.recent({ since, limit: 200 })).sort((a, b) =>
      b.signalScore.total !== a.signalScore.total
        ? b.signalScore.total - a.signalScore.total
        : a.id < b.id
          ? -1
          : 1,
    );

    const index = all.findIndex((s) => s.id === id);

    return {
      detail: toSignalDetail(signal),
      prevId: index > 0 ? all[index - 1].id : null,
      nextId: index >= 0 && index < all.length - 1 ? all[index + 1].id : null,
    };
  }
}

/** The regime most of the current signals fired in — the market's character. */
function dominantRegime(regimes: MarketRegime[]): MarketRegime {
  if (regimes.length === 0) return "RANGE";
  const counts = new Map<MarketRegime, number>();
  for (const r of regimes) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].sort(([, a], [, b]) => b - a)[0][0];
}

function dominantRisk(levels: RiskLevel[]): RiskLevel {
  if (levels.length === 0) return "MODERATE";
  const counts = new Map<RiskLevel, number>();
  for (const l of levels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts.entries()].sort(([, a], [, b]) => b - a)[0][0];
}
