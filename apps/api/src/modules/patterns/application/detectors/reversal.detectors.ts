import type { Pattern } from "@aegis/contracts";
import type { IPatternDetector } from "../../domain/pattern.interface";
import { MINIMUM_REPORTABLE_QUALITY } from "../../domain/pattern.interface";
import type { Swing } from "../../domain/swing";
import { QualityEngine } from "../services/quality.engine";

const quality = new QualityEngine();

/**
 * DOUBLE / TRIPLE TOPS AND BOTTOMS.
 *
 * Objective enough to trust — "two swing highs within 0.15% of each other, with a
 * meaningful trough between them" is a measurement. That is exactly why these are
 * in the vocabulary while head & shoulders is not: nobody has to draw a neckline,
 * and two people running this detector on the same candles get the same answer.
 *
 * ── The three rules that make it a pattern instead of a coincidence ──
 *
 * 1. **The peaks must be EQUAL**, within tolerance. Two highs 2% apart are not a
 *    double top, they are a lower high — which is a different pattern meaning a
 *    different thing (it is *downtrend structure*, and it is arguably stronger).
 *
 * 2. **There must be a real TROUGH between them.** Two highs three bars apart with
 *    a 0.2% dip in between is one high with a wobble in it. Without this rule the
 *    detector reports a double top on every plateau.
 *
 * 3. **The peaks must be PROMINENT.** Two rounding errors that happened to have
 *    lower bars on either side will pass rules 1 and 2 perfectly.
 *
 * ── The neckline is where the trade is ──
 *
 * The pattern is not confirmed by the second peak. It is confirmed when price
 * CLOSES below the trough between them — the neckline. Until then it is a setup,
 * and a great many double tops simply become... higher highs. `breakoutPending`
 * carries that distinction, and a detector that omitted it would be reporting
 * unconfirmed reversals as though they had happened.
 */

function reversalDetector(input: {
  pattern: Pattern;
  label: string;
  kind: "HIGH" | "LOW";
  peaks: number;
}): IPatternDetector {
  const { pattern, label, kind, peaks } = input;
  const top = kind === "HIGH";

  return {
    pattern,
    label,
    minimumCandles: 30,
    minimumSwings: peaks * 2,

    detect(context) {
      const { candles, swings } = context;

      const relevant = swings.filter((s) => s.kind === kind);
      if (relevant.length < peaks) return [];

      // The most recent N peaks.
      const chosen = relevant.slice(-peaks);

      // RULE 1 — they must all be equal, within tolerance.
      const prices = chosen.map((s) => s.price);
      const highest = Math.max(...prices);
      const lowest = Math.min(...prices);
      const disagreement = (highest - lowest) / highest;

      if (disagreement > EQUAL_TOLERANCE) return [];

      // RULE 2 — a real trough between each consecutive pair.
      const troughs: Swing[] = [];

      for (let i = 1; i < chosen.length; i++) {
        const trough = findTrough(swings, chosen[i - 1], chosen[i], top);
        if (!trough) return [];

        const depth =
          Math.abs(chosen[i].price - trough.price) / Math.max(chosen[i].price, 1e-9);

        // Two highs with a 0.2% dip between them are one high with a wobble.
        if (depth < MINIMUM_TROUGH_DEPTH) return [];

        troughs.push(trough);
      }

      // The neckline: the trough that must break to confirm. For a triple top, the
      // shallowest one — because that is the first level price would actually have
      // to close through.
      const neckline = top
        ? troughs.reduce((a, b) => (a.price > b.price ? a : b))
        : troughs.reduce((a, b) => (a.price < b.price ? a : b));

      const last = candles.at(-1)!;

      const confirmed = top
        ? last.close < neckline.price
        : last.close > neckline.price;

      const troughDepth =
        Math.abs(chosen[0].price - neckline.price) / Math.max(chosen[0].price, 1e-9);

      const volume = quality.volumeExpansion(
        context.relativeVolume,
        candles.length - 1,
      );

      const factors = [
        {
          name: "peak equality",
          value: Math.max(0, 1 - disagreement / EQUAL_TOLERANCE),
          evidence: `the ${peaks} ${top ? "peaks" : "troughs"} agree to within ${(disagreement * 100).toFixed(3)}%`,
          weakness: `the ${top ? "peaks" : "troughs"} are ${(disagreement * 100).toFixed(2)}% apart — that is a ${top ? "lower high" : "higher low"}, not a ${label.toLowerCase()}`,
        },
        {
          name: "trough depth",
          value: Math.min(1, troughDepth / (MINIMUM_TROUGH_DEPTH * 4)),
          evidence: `the ${top ? "trough" : "peak"} between them is a genuine ${(troughDepth * 100).toFixed(1)}% pullback — these are separate attempts, not one wobble`,
          weakness: `there is only a ${(troughDepth * 100).toFixed(1)}% ${top ? "dip" : "bump"} between them — this is one ${top ? "peak" : "low"} with a wobble in it`,
        },
        quality.swingProminence(chosen),
      ];

      const verdict = quality.score(factors);
      if (verdict.quality < MINIMUM_REPORTABLE_QUALITY) return [];

      const used = [...chosen, ...troughs].sort((a, b) => a.index - b.index);

      return [
        {
          pattern,
          timeframe: context.timeframe,
          direction: top ? "SHORT" : "LONG",
          quality: verdict.quality,
          strength: quality.significance({
            candles,
            fromIndex: used[0].index,
            toIndex: candles.length - 1,
            impliedMove: troughDepth,
          }),
          detectedAt: last.time,
          startedAt: chosen[0].time,
          swings: used.map(toSwingPoint),

          // THE NECKLINE. This is where the pattern is actually confirmed — not at
          // the second peak, which a great many double tops never follow through
          // from.
          triggerPrice: neckline.price,
          invalidationPrice: top ? highest : lowest,

          confirmed: true,
          breakoutPending: !confirmed,
          volumeConfirmed: confirmed ? volume.confirmed : null,

          evidence: [
            `${peaks} ${top ? "failed attempts at the same ceiling" : "successful defences of the same floor"} near ${fmt(chosen[0].price)}`,
            ...verdict.evidence,
            confirmed
              ? `price has CLOSED through the neckline at ${fmt(neckline.price)} — the pattern is complete`
              : `price has NOT yet closed through the neckline at ${fmt(neckline.price)} — this is a setup, not an event`,
          ],
          weaknesses: [
            ...verdict.weaknesses,
            ...(confirmed
              ? []
              : [
                  `unconfirmed — until price closes through ${fmt(neckline.price)}, this may simply become a ${top ? "higher high" : "lower low"}`,
                ]),
          ],
        },
      ];
    },
  };
}

/** The lowest low (for a top) between two peaks. */
function findTrough(
  swings: readonly Swing[],
  a: Swing,
  b: Swing,
  top: boolean,
): Swing | null {
  const between = swings.filter(
    (s) =>
      s.kind === (top ? "LOW" : "HIGH") && s.index > a.index && s.index < b.index,
  );

  if (between.length === 0) return null;

  return top
    ? between.reduce((lo, s) => (s.price < lo.price ? s : lo))
    : between.reduce((hi, s) => (s.price > hi.price ? s : hi));
}

export const doubleTopDetector = reversalDetector({
  pattern: "DOUBLE_TOP",
  label: "Double top",
  kind: "HIGH",
  peaks: 2,
});

export const doubleBottomDetector = reversalDetector({
  pattern: "DOUBLE_BOTTOM",
  label: "Double bottom",
  kind: "LOW",
  peaks: 2,
});

/**
 * TRIPLE_TOP / TRIPLE_BOTTOM.
 *
 * More telling than a double, and for a specific reason: the third failure means
 * buyers were rejected there **after already knowing it was a ceiling**. The first
 * rejection is information; the third is a verdict.
 *
 * Note it will also fire alongside DOUBLE_TOP on the same swings (the last two of
 * the three are, after all, a double top). That is intentional and is handled at
 * the Confluence layer, not by suppressing one here — a detector that silently hid
 * a real pattern to avoid overlap would be lying about what it found.
 */
export const tripleTopDetector = reversalDetector({
  pattern: "TRIPLE_TOP",
  label: "Triple top",
  kind: "HIGH",
  peaks: 3,
});

export const tripleBottomDetector = reversalDetector({
  pattern: "TRIPLE_BOTTOM",
  label: "Triple bottom",
  kind: "LOW",
  peaks: 3,
});

/* ── helpers ───────────────────────────────────────────────────────── */

function toSwingPoint(swing: Swing) {
  return {
    time: swing.time,
    price: swing.price,
    kind: swing.kind,
    strength: swing.strength,
  };
}

function fmt(price: number): string {
  if (price >= 1_000) return price.toFixed(0);
  if (price >= 1) return price.toFixed(2);
  return price.toPrecision(4);
}

/** Peaks more than 0.5% apart are not "equal" — they are a higher or lower high. */
const EQUAL_TOLERANCE = 0.005;

/** Less than a 1% pullback between peaks means it is one peak with a wobble. */
const MINIMUM_TROUGH_DEPTH = 0.01;
