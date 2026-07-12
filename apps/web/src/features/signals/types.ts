/**
 * Signal Intelligence types.
 *
 * Every DTO below is owned by `@aegis/contracts` and re-exported here — never
 * redeclared (AGENTS.md §2, ADR-022). This module exists only so the existing
 * `@/features/signals/types` import path keeps working.
 *
 * Never add a DTO to this file. Add it to the contract.
 */

export type {
  AICommentary,
  ChecklistItem,
  ConfidenceContributor,
  RiskFactor,
  SignalDetail,
  SignalDetailResponse,
  SimilarSignal,
  StrategyExplanationContent,
  StrategyStats,
} from "@aegis/contracts";

export {
  aiCommentarySchema,
  signalDetailResponseSchema,
  signalDetailSchema,
} from "@aegis/contracts";
