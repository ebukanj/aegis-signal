import type {
  CalibratedConfidence,
  ConfidenceContributor,
} from "@aegis/contracts";
import { createSeededRandom, randInt } from "@/lib/seeded-random";
import type { Opportunity } from "@/features/scanner/types";

/**
 * An honest confidence score — in the shape the backend will fill.
 *
 * This replaces `randInt(52, 92) + extras * 4`, which was a random number
 * wearing a percent sign (ADR-024).
 *
 * IMPORTANT — this file does not *decide* anything. The frontend renders; it
 * never computes a score (AGENTS.md §6). What it does is produce mock data in
 * the exact shape the Confidence Engine will emit, so that:
 *
 *   1. The UI is built against the honest shape from the start, and
 *   2. Swapping the mock for the API changes one function and nothing else.
 *
 * The values here are fabricated — they are mock data. The *structure* is not:
 * every contributor carries its weight, its source, and the measured value it
 * came from, and the score is the sum of them. A number you cannot show the
 * arithmetic for is a number this platform will not display.
 */

/** Every strategy is UNPROVEN today: no live signals, no historical replay. */
export function buildCalibration(
  opportunity: Opportunity,
): CalibratedConfidence {
  const rand = createSeededRandom(
    opportunity.id.split("").reduce((a, c) => a + c.charCodeAt(0), 11),
  );

  const primary = opportunity.strategies[0];
  const contributors: ConfidenceContributor[] = [];

  // Base — what this strategy has historically done. There is no ledger and no
  // historical replay yet, so this is a rule-derived starting point and says so.
  contributors.push({
    name: `${primary} base rate`,
    weight: 50,
    source: "RULE",
    measured: "no settled signals yet",
    note: "Where the score starts before any evidence about this setup.",
  });

  // Confluence — ADR-021. The uplift is currently NOT calibrated, and the note
  // says so rather than inventing +4 per strategy as the old code did.
  if (opportunity.strategies.length > 1) {
    contributors.push({
      name: "Strategy confluence",
      weight: randInt(rand, 6, 12),
      source: "RULE",
      measured: `${opportunity.strategies.length} strategies agree — ${opportunity.strategies.join(", ")}`,
      note: "Uplift not yet calibrated: we have no record of how often agreement actually wins.",
    });
  }

  // Measured evidence — the parts that are real the moment exchange data flows.
  const volumeMultiple = (1.5 + rand() * 1.4).toFixed(1);
  contributors.push({
    name: "Volume confirmation",
    weight: randInt(rand, 4, 8),
    source: "MEASURED",
    measured: `${volumeMultiple}× average (needed 1.5×)`,
    note: "Real participation behind the move, not a thin-book wick.",
  });

  contributors.push({
    name: "Higher-timeframe trend aligned",
    weight: randInt(rand, 3, 7),
    source: "MEASURED",
    measured: `price on the right side of the 4h 200 EMA`,
    note: "Trading with the tide rather than against it.",
  });

  // A penalty. Contributors must be able to subtract, or the score only ever
  // flatters the trade.
  if (rand() < 0.4) {
    contributors.push({
      name: "Resistance overhead",
      weight: -randInt(rand, 5, 10),
      source: "MEASURED",
      measured: `${(0.4 + rand() * 0.8).toFixed(1)} ATR to the next 4h level`,
      note: "The target path runs into a level that has held before.",
    });
  }

  if (rand() < 0.25) {
    contributors.push({
      name: "Funding crowded",
      weight: -randInt(rand, 4, 9),
      source: "MEASURED",
      measured: `+0.0${randInt(rand, 4, 8)}% per 8h`,
      note: "This side is already paying to hold the position.",
    });
  }

  const score = Math.max(
    0,
    Math.min(100, contributors.reduce((sum, c) => sum + c.weight, 0)),
  );

  return {
    score,
    contributors,
    // No ledger, no historical replay — so no probability may be shown. This is
    // the whole point of ADR-024, and the contract enforces it.
    basis: "UNCALIBRATED",
    historicalWinRate: null,
    historicalSamples: 0,
    liveWinRate: null,
    liveSamples: 0,
    displayedWinRate: null,
  };
}
