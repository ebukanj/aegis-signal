import { apiGet } from "@/lib/api";
import type { EconomicCalendar } from "@aegis/contracts";

/**
 * Macro data access — LIVE (M19). The economic calendar (upcoming + recently
 * printed high-impact events) and the current macro window.
 */
export const macroApi = {
  calendar: (): Promise<EconomicCalendar> => apiGet<EconomicCalendar>("/macro/calendar"),
};
