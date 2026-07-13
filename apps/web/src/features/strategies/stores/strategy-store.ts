"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StrategyDefinition } from "@aegis/contracts";
import { BUILT_IN_STRATEGIES } from "@/constants/strategies";

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
          const exists = state.strategies.some((s) => s.id === strategy.id);
          return {
            strategies: exists
              ? state.strategies.map((s) =>
                  s.id === strategy.id ? strategy : s,
                )
              : [...state.strategies, strategy],
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
    { name: "aegis-strategies" },
  ),
);

export { nextCustomId };
