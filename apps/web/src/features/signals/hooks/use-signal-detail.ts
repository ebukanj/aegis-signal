"use client";

import { useQuery } from "@tanstack/react-query";
import {
  SignalNotFoundError,
  signalsApi,
} from "@/features/signals/api/signals-api";

export const signalKeys = {
  detail: (id: string) => ["signals", "detail", id] as const,
  aiCommentary: (id: string) => ["signals", "ai-commentary", id] as const,
};

export function useSignalDetail(id: string) {
  return useQuery({
    queryKey: signalKeys.detail(id),
    queryFn: () => signalsApi.getSignalDetail(id),
    retry: (failureCount, error) =>
      !(error instanceof SignalNotFoundError) && failureCount < 2,
  });
}

/** Separate query — the AI layer is slower and must never block the report. */
export function useAICommentary(id: string, enabled: boolean) {
  return useQuery({
    queryKey: signalKeys.aiCommentary(id),
    queryFn: () => signalsApi.getAICommentary(id),
    enabled,
    staleTime: Infinity,
  });
}

export { SignalNotFoundError };
