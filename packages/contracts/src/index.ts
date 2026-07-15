/**
 * @aegis/contracts — the language every part of Aegis Signal speaks.
 *
 * Every DTO, every enum, every runtime schema lives here and ONLY here.
 * `apps/web` and `apps/api` both import from this package; neither redeclares a
 * type. A hand-copied type elsewhere in the repo is a defect
 * (AGENTS.md §2 — ADR-022).
 *
 * Types are inferred from Zod schemas, so the compile-time type and the runtime
 * validator can never disagree with each other. That is not a convenience — a
 * shared `interface` cannot catch an API that returns `confidence: "87"` as a
 * string, and on a platform where a malformed number is a real trader's real
 * money, the contract has to be enforced at runtime.
 *
 * WHAT THIS PACKAGE NEVER DOES
 *   · query a database        · call an API
 *   · execute business logic  · know about NestJS
 *   · touch Redis             · know about React
 *
 * It describes data. It does not compute it.
 *
 * Import from the root only:
 *     import { SignalDetail, riskDecisionSchema } from "@aegis/contracts";
 */

/* ── Common ────────────────────────────────────────────────────────── */
export * from "./common/value-objects";

/* ── Enums ─────────────────────────────────────────────────────────── */
export * from "./domain";
export * from "./enums/platform";
export * from "./enums/lifecycle";

/* ── Invariants — the rules that make bad trades unrepresentable ───── */
export * from "./invariants";

/* ── Market ────────────────────────────────────────────────────────── */
export * from "./market/market-data";
export * from "./market/indicator-result";
export * from "./market/pattern-result";
export * from "./market/regime";

/* ── Strategy — a strategy is a document, not code (ADR-023) ───────── */
export * from "./strategy";
export * from "./strategy-language";
export * from "./candidate";
export * from "./strategies";

/* ── Risk — the veto ───────────────────────────────────────────────── */
export * from "./risk/risk";

/* ── Confidence — earned, never asserted (ADR-024) ─────────────────── */
export * from "./confidence";
export * from "./calibration";
export * from "./signal-engine";
export * from "./ledger";

/* ── Signals — the platform's single output ────────────────────────── */
export * from "./signal";
export * from "./scanner";

/* ── Insights — news, social, fundamentals, and the Risk Flag veto ──── */
export * from "./insight";

/* ── Events — the pipeline, and it is immutable ────────────────────── */
export * from "./events/events";

/* ── API and transport ─────────────────────────────────────────────── */
export * from "./api/envelope";
export * from "./api/websocket";

/* ── Dashboard view models ─────────────────────────────────────────── */
export * from "./dashboard";
