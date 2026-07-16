import { apiGet, apiSend } from "@/lib/api";
import type { ScanRequest, ScanResult } from "@aegis/contracts";

/**
 * Market Scanner data access — LIVE (M15).
 *
 * The scanner is the same live pipeline the platform runs itself, exposed as a
 * tool: `GET /scan` returns the most recent sweep, `POST /scan` runs the scan the
 * user asked for. Nothing here is mock — the rows are real risk-approved,
 * confidence-scored opportunities, and an empty result is the honest, common case.
 */
export const scannerApi = {
  /** The most recent sweep — the page's initial paint. */
  getLatest: (): Promise<ScanResult> => apiGet<ScanResult>("/scan"),

  /** Run the scan the user asked for and return the ranked result. */
  runScan: (request: ScanRequest): Promise<ScanResult> =>
    apiSend<ScanResult>("/scan", request),
};
