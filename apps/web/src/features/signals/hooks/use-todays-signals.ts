"use client";

import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isProven } from "@aegis/contracts";
import { insightsApi } from "@/features/insights/api/insights-api";
import { signalsApi } from "@/features/signals/api/signals-api";
import { useStrategyStore } from "@/features/strategies/stores/strategy-store";
import { onSignalsChanged } from "@/lib/signals-socket";
import type { TodaysSignals } from "@/features/signals/api/signals-api";

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
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["signals", "today"],
    queryFn: () => signalsApi.getTodaysSignals(),
    /*
     * A safety-net poll for FRESHNESS DECAY. The socket nudge handles discrete
     * changes (a signal settled, a new one published) instantly; this slow refetch
     * catches the continuous change — a signal ageing toward its expiry, its rank
     * slipping as freshness decays — so the ordering stays live even when nothing
     * has settled. 60s is far below a 1h bar, so the feed is never visibly stale.
     */
    refetchInterval: 60_000,
  });

  /*
   * The live wire. When the backend settles a signal or publishes one, it nudges;
   * we refetch immediately. This is what makes a missed/stopped signal leave the
   * feed on its own — the owner's requirement — without a manual refresh.
   */
  useEffect(() => {
    return onSignalsChanged(() => {
      void queryClient.invalidateQueries({ queryKey: ["signals", "today"] });
      void queryClient.invalidateQueries({ queryKey: ["track-record"] });
    });
  }, [queryClient]);

  /**
   * The veto (ADR-023 §5). A coin that was just exploited or depegged is
   * untouchable — no strategy gets an opinion on an asset that is actively
   * bleeding, however good the chart looks. This is not a filter the user can
   * turn off; it is the Risk Engine protecting them.
   */
  const flags = useQuery({
    queryKey: ["insights", "feed"],
    queryFn: () => insightsApi.getFeed(),
    select: (feed) => feed.riskFlags,
  });

  const blockedCoins = useMemo(
    () => new Set((flags.data ?? []).map((f) => f.coin)),
    [flags.data],
  );

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
        // The veto comes first. A flagged coin is untouchable, full stop.
        .filter((signal) => !blockedCoins.has(signal.coin))
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
  }, [query.data, enabledNames, primeEligibleNames, blockedCoins]);

  return { ...query, data, blockedCoins };
}
