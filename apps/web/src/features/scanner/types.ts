import type {
  MarketRegime,
  RiskLevel,
  SignalDirection,
  Timeframe,
} from "@/types/domain";

/**
 * Scanner types.
 *
 * The `Opportunity` DTO is owned by `@aegis/contracts` and re-exported here —
 * never redeclared (AGENTS.md §2, ADR-022). Only the UI-local filter state
 * below lives in this file, because filters are presentation state the backend
 * knows nothing about.
 */

export type { Opportunity } from "@aegis/contracts";
export { opportunitySchema } from "@aegis/contracts";

/** Toolbar filter state. "ALL" / empty array means the dimension is not filtered. */
export interface ScannerFilters {
  search: string;
  exchange: string;
  /** Multi-select: an opportunity matches if it involves ANY selected strategy. */
  strategies: string[];
  regime: MarketRegime | "ALL";
  riskLevel: RiskLevel | "ALL";
  timeframe: Timeframe | "ALL";
  direction: SignalDirection | "ALL";
  minConfidence: number;
}

export const DEFAULT_SCANNER_FILTERS: ScannerFilters = {
  search: "",
  exchange: "ALL",
  strategies: [],
  regime: "ALL",
  riskLevel: "ALL",
  timeframe: "ALL",
  direction: "ALL",
  minConfidence: 0,
};
