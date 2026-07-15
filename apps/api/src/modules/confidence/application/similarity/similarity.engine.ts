import { Injectable } from "@nestjs/common";
import type { EvidenceSnapshot, LabelledSetup } from "@aegis/contracts";

/**
 * "Have we seen this kind of setup before, and what happened?"
 *
 * ── Why this is a nearest-neighbour search and not a model ──
 *
 * A model would tell you a number. This tells you a number AND the rows it came
 * from, which means a trader can click through and see the actual setups — the
 * dates, the symbols, what each one did. Founding Principle 3: nothing behaves
 * like a black box. A similarity search is the most auditable form of "we have
 * seen this before" available, and its answers can be checked by hand.
 *
 * ── The tiers, and why they are tiers rather than a distance metric ──
 *
 * The obvious design is a weighted distance over the evidence dimensions, and it
 * is the wrong one: it silently trades a matching STRATEGY against a matching
 * volatility bucket, and those are not commensurable. "Breakout in a bull market"
 * and "Reversal in a bull market" are not 80% the same thing.
 *
 * So the search relaxes in a fixed, stated order, and it stops the moment it has
 * enough evidence:
 *
 *   1. Same strategy · same rules · same regime · same direction · same volatility
 *   2. …drop volatility
 *   3. …drop direction
 *   4. …drop regime  (the strategy's overall record)
 *
 * It NEVER relaxes past the strategy or its rules hash, and that boundary is
 * absolute: setups produced by a *different* strategy, or by an older version of
 * this one's rules, are not evidence about this strategy. ADR-024 is explicit —
 * editing a strategy wipes its track record — and this is where that is enforced
 * at read time rather than trusted to a delete somebody has to remember to run.
 */
@Injectable()
export class SimilarityEngine {
  /** The fewest matches worth reporting. Below this, the answer is "we don't know". */
  private static readonly MINIMUM = 10;

  search(
    evidence: EvidenceSnapshot,
    corpus: readonly LabelledSetup[],
  ): {
    matches: LabelledSetup[];
    wins: number;
    winRate: number | null;
    tier: string;
  } {
    /* The boundary that is never crossed. */
    const sameStrategy = corpus.filter(
      (s) =>
        s.evidence.strategyId === evidence.strategyId &&
        s.evidence.rulesHash === evidence.rulesHash,
    );

    const tiers: { name: string; match: (s: LabelledSetup) => boolean }[] = [
      {
        name: "same strategy, regime, direction and volatility",
        match: (s) =>
          s.evidence.regime === evidence.regime &&
          s.evidence.direction === evidence.direction &&
          s.evidence.volatilityBucket === evidence.volatilityBucket,
      },
      {
        name: "same strategy, regime and direction",
        match: (s) =>
          s.evidence.regime === evidence.regime &&
          s.evidence.direction === evidence.direction,
      },
      {
        name: "same strategy and regime",
        match: (s) => s.evidence.regime === evidence.regime,
      },
      {
        name: "same strategy, any market",
        match: () => true,
      },
    ];

    for (const tier of tiers) {
      const matches = sameStrategy.filter(tier.match);

      if (matches.length >= SimilarityEngine.MINIMUM) {
        const wins = matches.filter((s) => s.outcome === "WIN").length;

        return {
          matches,
          wins,
          winRate: wins / matches.length,
          tier: tier.name,
        };
      }
    }

    /*
     * Not even the loosest tier found enough.
     *
     * We return what we have and a NULL win rate — not the rate of the three
     * setups we did find. Three setups produce a number that looks exactly like
     * knowledge and is not, and the whole apparatus of this milestone exists to
     * refuse precisely that.
     */
    const wins = sameStrategy.filter((s) => s.outcome === "WIN").length;

    return {
      matches: sameStrategy,
      wins,
      winRate: null,
      tier:
        sameStrategy.length === 0
          ? "nothing in the corpus resembles this setup"
          : `only ${sameStrategy.length} comparable setup(s) — too few to claim a rate`,
    };
  }
}
