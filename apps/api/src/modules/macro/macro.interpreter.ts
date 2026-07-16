import { Injectable } from "@nestjs/common";
import type { EconomicEvent, MacroInterpretation } from "@aegis/contracts";

/**
 * Read the surprise. What did the print mean for the risk complex?
 *
 * ── Deterministic, and modest ──
 *
 * This is arithmetic on actual-versus-forecast plus a handful of rules a
 * macro desk would not argue with — never a prediction, never a trade. Inflation
 * hotter than expected is hawkish and risk-off; a rate cut is risk-on. Where the
 * read is genuinely ambiguous (jobs can be "good news is bad news"), it says
 * NEUTRAL rather than inventing conviction. And it only speaks once the ACTUAL
 * number exists — before that, the honest answer is that nobody knows.
 *
 * It is context (ADR-023 §5): it colours the backdrop a trader reads. It cannot
 * create, block, or size a trade.
 */
@Injectable()
export class MacroInterpreter {
  interpret(event: EconomicEvent): MacroInterpretation | null {
    const actual = parseNumber(event.actual);
    if (actual === null) return null; // not printed yet — no honest read

    const forecast = parseNumber(event.forecast);
    const previous = parseNumber(event.previous);

    switch (event.category) {
      case "INFLATION": {
        if (forecast === null) return null;
        if (actual > forecast) {
          return { direction: "RISK_OFF", rationale: `${event.title} came in HOT (${event.actual} vs ${event.forecast} expected) — hawkish, pressure on risk assets.` };
        }
        if (actual < forecast) {
          return { direction: "RISK_ON", rationale: `${event.title} came in COOL (${event.actual} vs ${event.forecast} expected) — dovish, supportive of risk assets.` };
        }
        return { direction: "NEUTRAL", rationale: `${event.title} landed in line with expectations (${event.actual}).` };
      }

      case "RATES": {
        // A cut is risk-on, a hike risk-off; a hold leans on the surprise vs forecast.
        if (previous !== null && actual < previous) {
          return { direction: "RISK_ON", rationale: `Rate CUT to ${event.actual} (from ${event.previous}) — easing, risk-on.` };
        }
        if (previous !== null && actual > previous) {
          return { direction: "RISK_OFF", rationale: `Rate HIKE to ${event.actual} (from ${event.previous}) — tightening, risk-off.` };
        }
        if (forecast !== null && actual > forecast) {
          return { direction: "RISK_OFF", rationale: `Rates held higher than expected (${event.actual} vs ${event.forecast}) — hawkish surprise.` };
        }
        if (forecast !== null && actual < forecast) {
          return { direction: "RISK_ON", rationale: `Rates below expectation (${event.actual} vs ${event.forecast}) — dovish surprise.` };
        }
        return { direction: "NEUTRAL", rationale: `Rates held at ${event.actual}, as expected — guidance will do the talking.` };
      }

      case "EMPLOYMENT":
      case "GROWTH":
        // Genuinely two-sided (strong data can be hawkish). We refuse false precision.
        if (forecast === null) return null;
        return {
          direction: "NEUTRAL",
          rationale: `${event.title} printed ${event.actual} (vs ${event.forecast}) — read alongside rate expectations; direction is not clean.`,
        };

      default:
        return null;
    }
  }
}

/** Pull the first number out of a string like "3.2%", "+250K", "5.25%-5.50%". */
function parseNumber(value: string | null): number | null {
  if (value === null) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}
