import { apiGet } from "@/lib/api";
import type { TrackRecordView } from "@aegis/contracts";

/**
 * Track Record data access — LIVE.
 *
 * The scoreboard, from the Outcome Ledger (M11). Every number here is arithmetic
 * on signals that have actually settled — nothing is invented. When nothing has
 * settled, the API says so (basis NO_DATA) and the page shows the honest empty
 * state rather than a fabricated record.
 */
export const trackRecordApi = {
  get: (): Promise<TrackRecordView> => apiGet<TrackRecordView>("/track-record"),
};
