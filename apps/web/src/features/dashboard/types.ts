/**
 * Dashboard types.
 *
 * Every DTO below is owned by `@aegis/contracts` and re-exported here — never
 * redeclared (AGENTS.md §2, ADR-022). This module exists only so the existing
 * `@/features/dashboard/types` import path keeps working.
 *
 * Never add a DTO to this file. Add it to the contract.
 */

export type {
  ActivityEvent,
  ActivityKind,
  DashboardSignal,
  MarketIntelligence,
  MarketOverview,
  MarketRegime,
  PlatformHealth,
  RiskLevel,
  ServiceStatus,
  SignalDirection,
  StrategyHealthSummary,
  /** Point on the market overview series (was `MarketOverviewPoint`). */
  TimeSeriesPoint,
  TimeSeriesPoint as MarketOverviewPoint,
} from "@aegis/contracts";

export {
  activityEventSchema,
  dashboardSignalSchema,
  marketIntelligenceSchema,
  marketOverviewSchema,
  platformHealthSchema,
  strategyHealthSummarySchema,
} from "@aegis/contracts";
