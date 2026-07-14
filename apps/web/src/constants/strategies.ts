/**
 * The six built-in strategies now live in `packages/contracts`.
 *
 * ── Why they moved ──
 *
 * The backend has to EVALUATE these documents; the frontend has to render and edit
 * them. Two copies of the same six strategies would be two sources of truth for one
 * concept — exactly what AGENTS.md §2 exists to forbid — and they would drift. Not
 * "might": *would*. Somebody adds a condition in one place, and the platform quietly
 * evaluates a strategy that is not the one the user is reading.
 *
 * So there is one copy, in the contract, and both apps import it. A strategy document
 * is part of the API surface — it is the *language* the two halves of the platform use
 * to talk about a trading idea — which is precisely what `packages/contracts` is for
 * (ADR-022).
 *
 * This file is a re-export, so nothing downstream had to change its imports.
 */
import { BUILT_IN_STRATEGIES } from "@aegis/contracts";

export { BUILT_IN_STRATEGIES, strategyById } from "@aegis/contracts";

/** Derived, not declared — so it can never drift from the documents themselves. */
export const SPOT_ONLY_STRATEGY_NAMES: string[] = BUILT_IN_STRATEGIES.filter(
  (s) => s.market === "SPOT",
).map((s) => s.name);
