import {
  mockOpportunities,
  scannerFilterOptions,
} from "@/features/scanner/data/mock-opportunities";
import type { Opportunity } from "@/features/scanner/types";

/**
 * Scanner data access. Simulates the REST API with mock data + latency.
 * The real endpoint will accept filter/pagination params server-side;
 * until then the full ranked set is returned and filtered client-side.
 */

const simulate = <T>(data: T, delayMs = 600): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), delayMs));

export const scannerApi = {
  getOpportunities: (): Promise<Opportunity[]> =>
    simulate(mockOpportunities, 650),

  getFilterOptions: () => scannerFilterOptions,
};
