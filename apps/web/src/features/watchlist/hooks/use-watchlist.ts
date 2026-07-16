"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { watchlistApi } from "@/features/watchlist/api/watchlist-api";
import { ApiError } from "@/lib/api";

const KEY = ["watchlist"] as const;

/**
 * The signed-in user's watchlist, with optimistic add/remove.
 *
 * The mutations write the new list straight from the server response, so the card
 * always shows the truth the backend holds. A failed add/remove rolls back and
 * says why.
 */
export function useWatchlist() {
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: KEY, queryFn: () => watchlistApi.get() });

  const set = (coins: string[]) => queryClient.setQueryData(KEY, coins);

  const add = useMutation({
    mutationFn: (coin: string) => watchlistApi.add(coin),
    onSuccess: set,
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not add that coin."),
  });

  const remove = useMutation({
    mutationFn: (coin: string) => watchlistApi.remove(coin),
    onSuccess: set,
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not remove that coin."),
  });

  return {
    coins: query.data ?? [],
    isLoading: query.isPending,
    add: (coin: string) => add.mutate(coin),
    remove: (coin: string) => remove.mutate(coin),
    isMutating: add.isPending || remove.isPending,
  };
}
