"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { isProven } from "@aegis/contracts";
import { signalsApi } from "@/features/signals/api/signals-api";
import { useStrategyStore } from "@/features/strategies/stores/strategy-store";
import type { TodaysSignals } from "@/features/signals/data/mock-today";

/**
 * Today's signals — filtered by the strategies you actually have switched on.
 *
 * THE BUG THIS FIXES: the toggle on the Strategies page wrote to a store that
 * nothing else read. Signals, the Prime budget and confluence all enumerated the
 * built-in list regardless. You could switch Reversal off and it would keep
 * producing Prime signals. The switch was decoration (ADR-024).
 *
 * The rules now, and they are strict:
 *
 *   1. A DISABLED strategy cannot fire. Not as a signal, not as a confluence
 *      partner. If a signal's only strategies are disabled, it does not exist.
 *
 *   2. A signal keeps only its ENABLED contributors. If Breakout and Reversal
 *      agreed but you switched Reversal off, the signal survives as a Breakout
 *      signal — and it loses the confluence uplift, because you told us not to
 *      trust Reversal.
 *
 *   3. PRIME requires every contributing strategy to be enabled AND proven. An
 *      unproven rule has earned nothing (ADR-023 §4), and a disabled one you
 *      have explicitly rejected. Neither belongs in the few trades we push to
 *      your phone.
 *
 * When the backend ships, this filtering moves server-side — the API will know
 * which strategies a user has enabled. Until then it happens here, so the
 * behaviour is already correct when the API arrives.
 */
export function useTodaysSignals() {
  const strategies = useStrategyStore((s) => s.strategies);

  const query = useQuery({
    queryKey: ["signals", "today"],
    queryFn: () => signalsApi.getTodaysSignals(),
  });

  const enabledNames = useMemo(
    () => new Set(strategies.filter((s) => s.enabled).map((s) => s.name)),
    [strategies],
  );

  /** Enabled AND proven. Prime is reserved for rules that have earned it. */
  const primeEligibleNames = useMemo(
    () =>
      new Set(
        strategies
          .filter((s) => s.enabled && isProven(s))
          .map((s) => s.name),
      ),
    [strategies],
  );

  const data: TodaysSignals | undefined = useMemo(() => {
    if (!query.data) return undefined;

    const apply = (signals: TodaysSignals["prime"]) =>
      signals
        // Keep only the contributors the user actually trusts.
        .map((signal) => ({
          ...signal,
          strategies: signal.strategies.filter((name) =>
            enabledNames.has(name),
          ),
        }))
        // A signal with no enabled strategy behind it is not a signal.
        .filter((signal) => signal.strategies.length > 0)
        // Prime demands every contributor be enabled and proven.
        .map((signal) => ({
          ...signal,
          isPrime:
            signal.isPrime &&
            signal.strategies.every((name) => primeEligibleNames.has(name)),
        }));

    const prime = apply(query.data.prime);
    const validated = apply(query.data.validated);

    // Signals demoted out of Prime are still valid — they fall to "also
    // validated" rather than vanishing. Nothing is hidden.
    const demoted = prime.filter((s) => !s.isPrime);

    return {
      context: {
        ...query.data.context,
        strategiesActive: enabledNames.size,
      },
      prime: prime.filter((s) => s.isPrime),
      validated: [...demoted, ...validated],
    };
  }, [query.data, enabledNames, primeEligibleNames]);

  return { ...query, data };
}
