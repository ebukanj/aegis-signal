import type {
  ActivityKind,
  MarketRegime,
  OpportunityStatus,
  RiskLevel,
  ServiceStatus,
  SignalOutcome,
  SignalStatus,
} from "@/types/domain";

/**
 * Presentation maps for domain enums: human label + semantic status color.
 * Shared by every workspace that renders these values.
 */

type BadgeStatus =
  | "neutral"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "long"
  | "short";

export const REGIME_META: Record<
  MarketRegime,
  { label: string; status: BadgeStatus }
> = {
  TRENDING_BULL: { label: "Trending Bull", status: "success" },
  TRENDING_BEAR: { label: "Trending Bear", status: "error" },
  RANGE: { label: "Ranging", status: "info" },
  TRANSITION: { label: "Transitioning", status: "warning" },
  HIGH_VOLATILITY: { label: "High Volatility", status: "warning" },
  RISK_OFF: { label: "Risk-Off", status: "error" },
};

export const RISK_META: Record<
  RiskLevel,
  { label: string; status: BadgeStatus }
> = {
  LOW: { label: "Low", status: "success" },
  MODERATE: { label: "Moderate", status: "info" },
  ELEVATED: { label: "Elevated", status: "warning" },
  HIGH: { label: "High", status: "error" },
};

export const SERVICE_STATUS_META: Record<
  ServiceStatus,
  { label: string; status: BadgeStatus }
> = {
  OPERATIONAL: { label: "Operational", status: "success" },
  DEGRADED: { label: "Degraded", status: "warning" },
  DOWN: { label: "Down", status: "error" },
};

export const ACTIVITY_KIND_META: Record<ActivityKind, { label: string }> = {
  SIGNAL: { label: "Signal" },
  STRATEGY_CHANGE: { label: "Strategy" },
  NOTIFICATION: { label: "Alert" },
  SYSTEM: { label: "System" },
};

export const OPPORTUNITY_STATUS_META: Record<
  OpportunityStatus,
  { label: string; status: BadgeStatus }
> = {
  ACTIVE: { label: "Active", status: "success" },
  WATCHLIST: { label: "Watchlist", status: "info" },
  EXPIRING: { label: "Expiring", status: "warning" },
};

export const SIGNAL_STATUS_META: Record<
  SignalStatus,
  { label: string; status: BadgeStatus }
> = {
  ACTIVE: { label: "Active", status: "success" },
  TRIGGERED: { label: "Triggered", status: "info" },
  COMPLETED: { label: "Completed", status: "success" },
  STOPPED: { label: "Stopped", status: "error" },
  EXPIRED: { label: "Expired", status: "neutral" },
};

export const STRATEGY_STATUS_META: Record<
  "ACTIVE" | "PROBATION" | "DISABLED",
  { label: string; status: BadgeStatus }
> = {
  ACTIVE: { label: "Active", status: "success" },
  PROBATION: { label: "Probation", status: "warning" },
  DISABLED: { label: "Disabled", status: "neutral" },
};

export const SIGNAL_OUTCOME_META: Record<
  SignalOutcome,
  { label: string; status: BadgeStatus }
> = {
  WIN: { label: "Win", status: "success" },
  LOSS: { label: "Loss", status: "error" },
  BREAKEVEN: { label: "Breakeven", status: "neutral" },
};
