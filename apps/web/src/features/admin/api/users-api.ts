import { apiGet, apiSend } from "@/lib/api";
import type { User } from "@aegis/contracts";

/**
 * User administration — LIVE. Role-gated server-side: these endpoints demand an
 * ADMIN bearer token; a TRADER gets a 403 no matter what the UI shows.
 */
export const adminUsersApi = {
  list: (): Promise<User[]> => apiGet<User[]>("/admin/users"),

  setSuspended: (id: string, suspended: boolean): Promise<User> =>
    apiSend<User>(`/admin/users/${encodeURIComponent(id)}/suspension`, { suspended }, "PATCH"),

  remove: (id: string): Promise<void> =>
    apiSend<void>(`/admin/users/${encodeURIComponent(id)}`, undefined, "DELETE"),
};
