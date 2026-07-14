"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StrategyDefinition } from "@aegis/contracts";
import { BUILT_IN_STRATEGIES } from "@/constants/strategies";
import { applyEdit, rulesHash } from "@aegis/contracts";

/**
 * Your strategies — built-in and your own, in one list.
 *
 * They are the same shape (ADR-023), so there is no second code path for a
 * strategy you wrote. You can switch any of them off, edit their parameters,
 * duplicate one as a starting point, and delete the ones you made.
 *
 * A built-in strategy cannot be deleted — only switched off. Deleting the rules
 * the platform ships with would leave a user unable to get them back.
 *
 * Persisted locally until the backend owns this table.
 */

interface StrategyState {
  strategies: StrategyDefinition[];
  toggle: (id: string) => void;
  upsert: (strategy: StrategyDefinition) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  reset: () => void;
}

function nextCustomId(existing: StrategyDefinition[]): string {
  return `custom-${Date.now().toString(36)}-${existing.length}`;
}

export const useStrategyStore = create<StrategyState>()(
  persist(
    (set) => ({
      strategies: BUILT_IN_STRATEGIES,

      toggle: (id) =>
        set((state) => ({
          strategies: state.strategies.map((s) =>
            s.id === id ? { ...s, enabled: !s.enabled } : s,
          ),
        })),

      upsert: (strategy) =>
        set((state) => {
          const existing = state.strategies.find((s) => s.id === strategy.id);

          /*
           * A brand-new strategy. It has earned nothing, and `applyEdit` has nothing
           * to compare against.
           */
          if (!existing) {
            return {
              strategies: [
                ...state.strategies,
                { ...strategy, version: 1, rulesHash: rulesHash(strategy), record: null },
              ],
            };
          }

          /*
           * AN EDIT. `applyEdit` decides honestly what survives it.
           *
           * If the RULES changed, the version bumps and the track record is WIPED — a
           * 60% win rate produced by an RSI threshold of 30 says nothing whatsoever
           * about the same strategy at 25, and carrying it across would let a trader
           * tune a strategy until it looked good and inherit confidence the previous
           * version earned. That is fabricated confidence with extra steps.
           *
           * If they only renamed it, nothing is lost. A typo is not a new strategy.
           */
          const saved = applyEdit(existing, strategy);

          return {
            strategies: state.strategies.map((s) =>
              s.id === saved.id ? saved : s,
            ),
          };
        }),

      /** Built-ins are switched off, never deleted — they must stay recoverable. */
      remove: (id) =>
        set((state) => ({
          strategies: state.strategies.filter(
            (s) => !(s.id === id && s.origin === "CUSTOM"),
          ),
        })),

      duplicate: (id) =>
        set((state) => {
          const source = state.strategies.find((s) => s.id === id);
          if (!source) return state;

          const copy: StrategyDefinition = {
            ...source,
            id: nextCustomId(state.strategies),
            name: `${source.name} (copy)`,
            origin: "CUSTOM",
            enabled: false,
            // A copy has earned nothing. It starts UNPROVEN, like any new rule.
            record: null,
          };
          return { strategies: [...state.strategies, copy] };
        }),

      reset: () => set({ strategies: BUILT_IN_STRATEGIES }),
    }),
    {
      name: "aegis-strategies",
      /**
       * Bumped for ADR-024. The vocabulary changed shape — conditions gained a
       * `kind` discriminator, and patterns arrived — so a strategy saved under
       * the old schema can no longer be evaluated.
       *
       * We discard rather than attempt to translate. A half-migrated trading
       * rule is worse than no rule: it would look valid, render plausibly, and
       * mean something different from what its author intended. Better to reseed
       * honestly than to silently mutate somebody's strategy.
       */
      /*
       * Bumped to 3 for M07. The ENTRY LANGUAGE changed shape: an entry item is no
       * longer a bare condition but a rule (which can be negated) or an ANY-OF group.
       * A strategy persisted under the old shape would fail schema validation on the
       * first evaluation.
       *
       * Discarded rather than translated, for exactly the reason already given below.
       */
      version: 3,
      migrate: () => ({ strategies: BUILT_IN_STRATEGIES }),
    },
  ),
);

export { nextCustomId };
