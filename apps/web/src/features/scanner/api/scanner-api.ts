import {
  mockOpportunities,
  scannerFilterOptions,
} from "@/features/scanner/data/mock-opportunities";
import { runMockScan } from "@/features/scanner/data/mock-scan";
import type { ScanRequest, ScanResult } from "@/features/scanner/data/mock-scan";
import type { Opportunity } from "@/features/scanner/types";

/**
 * Scanner data access. Simulates the REST API with mock data + latency.
 * Each function becomes a fetch when the backend ships.
 */

const simulate = <T>(data: T, delayMs = 600): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), delayMs));

export const scannerApi = {
  /** Run the scan the user asked for and return the ranked result. */
  runScan: (request: ScanRequest): Promise<ScanResult> =>
    simulate(runMockScan(request), 1400),

  /** The ranked set the Signals workspace consumes. */
  getOpportunities: (): Promise<Opportunity[]> =>
    simulate(mockOpportunities, 650),

  getFilterOptions: () => scannerFilterOptions,
};
