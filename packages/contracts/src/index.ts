/**
 * @aegis/contracts — the single definition of the Aegis Signal API surface.
 *
 * Every DTO, every domain enum, every runtime schema lives here and ONLY here.
 * `apps/web` and `apps/api` both import from this package; neither redeclares
 * a type. A hand-copied type elsewhere in the repo is a defect
 * (AGENTS.md §2, §6 — ADR-022).
 *
 * Types are inferred from Zod schemas, so the compile-time type and the
 * runtime validator can never disagree with each other.
 */

export * from "./domain";
export * from "./invariants";
export * from "./strategy";
export * from "./strategy-language";
export * from "./signal";
export * from "./scanner";
export * from "./dashboard";
