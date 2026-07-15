import { apiGet, ApiError } from "@/lib/api";
import type { SignalDetailResponse, SignalFeed } from "@aegis/contracts";
import type { AICommentary } from "@/features/signals/types";

/**
 * Signal Intelligence data access — LIVE.
 *
 * These call the Signal Engine's read API (M10). The feed and the detail are the
 * platform's real published signals; nothing here is mock.
 *
 * AI commentary remains unwired — the AI layer is a distinct, later service
 * (SOLUTION_ARCHITECTURE §10). It throws `NotYetLive` rather than returning
 * invented prose, and the page is built to render a signal fully without it.
 */

export type TodaysSignals = SignalFeed;

export class SignalNotFoundError extends Error {
  constructor(id: string) {
    super(`Signal ${id} not found`);
    this.name = "SignalNotFoundError";
  }
}

export class NotYetLive extends Error {
  constructor(what: string) {
    super(`${what} is not live yet`);
    this.name = "NotYetLive";
  }
}

export const signalsApi = {
  /** The home page's only question: what should I trade today? */
  getTodaysSignals: (): Promise<TodaysSignals> =>
    apiGet<TodaysSignals>("/signals/today"),

  getSignalDetail: async (id: string): Promise<SignalDetailResponse> => {
    try {
      return await apiGet<SignalDetailResponse>(`/signals/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new SignalNotFoundError(id);
      }
      throw error;
    }
  },

  /**
   * The AI commentary layer does not exist yet. It is a separate service, and
   * rather than fabricate market prose (the exact thing this platform refuses), it
   * declares itself unavailable. The report renders without it.
   */
  getAICommentary: (_id: string): Promise<AICommentary> => {
    throw new NotYetLive("AI commentary");
  },
};
