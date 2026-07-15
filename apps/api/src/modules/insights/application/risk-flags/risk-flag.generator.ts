import { Injectable } from "@nestjs/common";
import { riskFlagSchema, type Insight, type RiskFlag, type RiskFlagKind } from "@aegis/contracts";

/**
 * The one thing insights are allowed to DO: raise a veto.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A RISK FLAG STOPS A TRADE. IT NEVER STARTS ONE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Everything else in this engine is awareness — a story is a reason to LOOK. A
 * Risk Flag is the exception the whole engine exists to enable: when a coin has
 * just been exploited, hacked, delisted or depegged, NO strategy gets an opinion on
 * it, however good the chart looks (ADR-023 §5, "Protect the Trader"). The Risk
 * Engine consumes these; this only generates them.
 *
 * ── Corroboration is not optional ──
 *
 * A false veto costs a trader an opportunity. A missed veto costs them their
 * capital — but a veto raised on a single unconfirmed rumour is its own hazard: it
 * hands anyone who can plant one story the power to suppress the platform's signals
 * on a coin. So a flag requires **two independent sources** (the contract enforces
 * `sources.min(2)`), which is exactly what deduplication makes countable. One
 * outlet screaming "hack" is a reason to watch; two independent outlets is a reason
 * to stop.
 */
@Injectable()
export class RiskFlagGenerator {
  /** How long a flag blocks trading, by kind. Danger blocks longest. */
  private static readonly BLOCK_HOURS: Record<RiskFlagKind, number> = {
    EXPLOIT: 72,
    DEPEG: 72,
    DELISTING: 168, // a week — a delisting does not un-happen
    REGULATORY: 48,
    OUTAGE: 12,
    UNLOCK: 24,
  };

  /**
   * Derive the risk flags implied by a set of (already deduplicated) insights.
   *
   * Only flag-worthy CATEGORIES qualify, and only when corroborated. Everything
   * else stays awareness — visible in the feed, never a veto.
   */
  generate(insights: readonly Insight[]): RiskFlag[] {
    const flags: RiskFlag[] = [];

    for (const insight of insights) {
      const kind = flagKind(insight);
      if (!kind) continue;

      /* The veto's price: two independent sources. A single-source story is
       * awareness, not a block — it stays in the feed and can escalate later. */
      if (insight.sources.length < 2) continue;

      /* A flag needs a coin to block. A market-wide security story is context, not a
       * per-asset veto — there is nothing specific to stop. */
      const coins = insight.coins.length > 0 ? insight.coins : [];
      if (coins.length === 0) continue;

      const blockHours = RiskFlagGenerator.BLOCK_HOURS[kind];

      for (const coin of coins) {
        flags.push(
          riskFlagSchema.parse({
            id: `flag:${coin}:${insight.dedupeKey}`,
            coin,
            kind,
            headline: insight.title,
            detail: insight.description.slice(0, 280),
            sources: insight.sources,
            raisedAt: new Date(insight.publishedAt).toISOString(),
            blockedUntil: new Date(insight.publishedAt + blockHours * 3_600_000).toISOString(),
          }),
        );
      }
    }

    return flags;
  }

  /** Is a flag currently active — i.e. has it not yet expired? */
  isActive(flag: RiskFlag, now: number): boolean {
    return now < Date.parse(flag.blockedUntil);
  }
}

/** Map an insight's category/tags to a veto kind, or null if it is not flag-worthy. */
function flagKind(insight: Insight): RiskFlagKind | null {
  if (insight.category === "EXPLOIT") return "EXPLOIT";
  if (insight.category === "HACK") return "EXPLOIT";
  if (insight.category === "DELISTING") return "DELISTING";
  if (insight.tags.includes("depeg")) return "DEPEG";
  if (insight.category === "REGULATION" && insight.severity === "HIGH") return "REGULATORY";
  if (insight.category === "MAINTENANCE" && insight.severity !== "LOW") return "OUTAGE";
  /* An unlock is only a veto when it is imminent and specific; a general tokenomics
   * mention is awareness. Require the explicit tag AND a named coin (checked upstream). */
  if (insight.category === "TOKENOMICS" && insight.tags.includes("tokenomics") && insight.title.toLowerCase().includes("unlock")) {
    return "UNLOCK";
  }
  return null;
}
