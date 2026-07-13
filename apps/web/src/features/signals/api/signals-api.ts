import {
  getMockAICommentary,
  getMockSignalDetail,
} from "@/features/signals/data/mock-signal-details";
import { getMockTodaysSignals } from "@/features/signals/data/mock-today";
import type { TodaysSignals } from "@/features/signals/data/mock-today";
import type {
  AICommentary,
  SignalDetailResponse,
} from "@/features/signals/types";

/**
 * Signal Intelligence data access. Simulates the REST API with mock data
 * + latency; each function becomes a fetch when the backend ships.
 * AI commentary is a separate, slower endpoint by design — the AI layer is a
 * distinct service (SOLUTION_ARCHITECTURE §10) and the page must not wait on it.
 */

const simulate = <T>(data: T, delayMs: number): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), delayMs));

export class SignalNotFoundError extends Error {
  constructor(id: string) {
    super(`Signal ${id} not found`);
    this.name = "SignalNotFoundError";
  }
}

export const signalsApi = {
  /** The home page's only question: what should I trade today? */
  getTodaysSignals: (): Promise<TodaysSignals> =>
    simulate(getMockTodaysSignals(), 500),

  getSignalDetail: async (id: string): Promise<SignalDetailResponse> => {
    const response = getMockSignalDetail(id);
    if (!response) {
      await simulate(null, 350);
      throw new SignalNotFoundError(id);
    }
    return simulate(response, 550);
  },

  getAICommentary: async (id: string): Promise<AICommentary> => {
    const commentary = getMockAICommentary(id);
    if (!commentary) throw new SignalNotFoundError(id);
    return simulate(commentary, 1400);
  },
};
