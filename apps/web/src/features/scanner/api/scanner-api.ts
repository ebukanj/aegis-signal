import {
  mockOpportunities,
  scannerFilterOptions,
} from "@/features/scanner/data/mock-opportunities";
import { getMockScanRun } from "@/features/scanner/data/mock-scan";
import type { ScanRun } from "@/features/scanner/data/mock-scan";
import type { Opportunity } from "@/features/scanner/types";

/**
 * Scanner data access. Simulates the REST API with mock data + latency.
 * Each function becomes a fetch when the backend ships.
 */

const simulate = <T>(data: T, delayMs = 600): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(data), delayMs));

export const scannerApi = {
  /** The scan itself: what was checked, what passed, and what was rejected. */
  getScanRun: (): Promise<ScanRun> => simulate(getMockScanRun(), 550),

  /**
   * The ranked opportunity set. Consumed by the Signals workspace, which is
   * where a trader acts on them.
   */
  getOpportunities: (): Promise<Opportunity[]> =>
    simulate(mockOpportunities, 650),

  getFilterOptions: () => scannerFilterOptions,
};
