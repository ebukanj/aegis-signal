import type { AdminOverviewDto, AuditEntryDto, FeatureFlagDto, MaintenanceStateDto } from "@aegis/contracts";
import { apiGetAdmin, apiSend } from "@/lib/api";

/**
 * Admin data access — LIVE.
 *
 * Everything here talks to the real `/admin` API (M14): the platform overview
 * (system health, module metrics, queues, exchanges, flags, maintenance) and the
 * append-only audit log, plus the two levers an operator can pull — feature flags
 * and maintenance mode. The reads are guarded by the same admin token as the writes,
 * because the overview exposes internal state a public page has no business showing.
 *
 * Surfaces without a backend yet (users, roles, workers, historical monitoring)
 * remain on clearly-labelled placeholder data — this file only covers what is real.
 */
export const adminApi = {
  getOverview: (): Promise<AdminOverviewDto> => apiGetAdmin<AdminOverviewDto>("/admin/overview"),
  getAudit: (): Promise<AuditEntryDto[]> => apiGetAdmin<AuditEntryDto[]>("/admin/audit"),

  setFlag: (key: string, change: { enabled?: boolean; rolloutPercent?: number }): Promise<FeatureFlagDto> =>
    apiSend<FeatureFlagDto>(`/admin/flags/${encodeURIComponent(key)}`, change),

  setMaintenance: (input: {
    enabled: boolean;
    message?: string;
    readOnly?: boolean;
    estimatedCompletion?: number | null;
  }): Promise<MaintenanceStateDto> => apiSend<MaintenanceStateDto>("/admin/maintenance", input),
};
