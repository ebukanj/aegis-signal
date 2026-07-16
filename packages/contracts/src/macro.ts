import { z } from "zod";
import { timestampSchema } from "./domain";

/**
 * Macro & the economic calendar (M19).
 *
 * The high-impact scheduled events that move the whole market at once — CPI, the
 * FOMC rate decision, NFP. Two jobs, and they are different:
 *
 *   PROTECT — around a high-impact release, volatility is unknowable and stops get
 *   hit on noise. The platform raises a MACRO WINDOW so a trader (and the risk
 *   surface) knows to stand down or size down. This is deterministic and needs no
 *   forecast: the SCHEDULE is enough.
 *
 *   INTERPRET — once the number PRINTS, the surprise versus forecast biases the
 *   whole risk complex. Hot inflation is risk-off; a cut is risk-on. This is
 *   context, never a signal — it explains the weather; it does not place the trade
 *   (ADR-023 §5).
 */

export const macroImpactSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type MacroImpact = z.infer<typeof macroImpactSchema>;

/** The read once a number prints. Never an instruction — a bias on the backdrop. */
export const macroDirectionSchema = z.enum(["RISK_ON", "RISK_OFF", "NEUTRAL", "UNKNOWN"]);
export type MacroDirection = z.infer<typeof macroDirectionSchema>;

export const macroCategorySchema = z.enum([
  "INFLATION",
  "RATES",
  "EMPLOYMENT",
  "GROWTH",
  "OTHER",
]);
export type MacroCategory = z.infer<typeof macroCategorySchema>;

/** The interpretation of a printed release — direction plus the reason, in words. */
export const macroInterpretationSchema = z.object({
  direction: macroDirectionSchema,
  rationale: z.string(),
});
export type MacroInterpretation = z.infer<typeof macroInterpretationSchema>;

export const economicEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** ISO-3166 alpha-2 or a currency ("US", "EU"). Most of what moves crypto is US. */
  country: z.string(),
  category: macroCategorySchema,
  impact: macroImpactSchema,
  /** When it releases. */
  time: timestampSchema,

  /** The consensus, the last print, and the actual — strings, as sources give them. */
  forecast: z.string().nullable(),
  previous: z.string().nullable(),
  actual: z.string().nullable(),

  /** Null until the number prints and we can read the surprise. */
  interpretation: macroInterpretationSchema.nullable(),

  /** Where it came from — "FOMC schedule" (built-in) or a data provider. */
  source: z.string(),
});
export type EconomicEvent = z.infer<typeof economicEventSchema>;

/**
 * Are we inside a high-impact macro window right now? `active` means a HIGH-impact
 * event is imminent or just printed — the moment to stand down.
 */
export const macroWindowSchema = z.object({
  active: z.boolean(),
  /** The event that opened the window, if any. */
  event: economicEventSchema.nullable(),
  /** Minutes until the event (negative once it has printed). Null when inactive. */
  minutesUntil: z.number().nullable(),
});
export type MacroWindow = z.infer<typeof macroWindowSchema>;

export const economicCalendarSchema = z.object({
  /** Upcoming events, soonest first. */
  upcoming: z.array(economicEventSchema),
  /** Recently printed events with their interpretation. */
  recent: z.array(economicEventSchema),
  window: macroWindowSchema,
  /** Whether a live keyed provider is feeding this, or only the built-in schedule. */
  source: z.enum(["BUILTIN", "PROVIDER"]),
  generatedAt: timestampSchema,
});
export type EconomicCalendar = z.infer<typeof economicCalendarSchema>;
