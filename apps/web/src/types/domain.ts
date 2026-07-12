/**
 * Domain enums — re-exported from the contract.
 *
 * These are NOT declared here. `@aegis/contracts` is their single owner
 * (AGENTS.md §2); this module exists only so the existing `@/types/domain`
 * import path keeps working across the app.
 *
 * Never add a domain type to this file. Add it to the contract.
 */

export type {
  ActivityKind,
  MarketRegime,
  MarketType,
  OpportunityStatus,
  RiskLevel,
  ServiceStatus,
  SignalDirection,
  SignalOutcome,
  SignalStatus,
  Timeframe,
  TimeSeriesPoint,
} from "@aegis/contracts";
