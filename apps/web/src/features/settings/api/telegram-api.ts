import { apiGet, apiSend } from "@/lib/api";

export interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  botUsername: string | null;
}

export interface TelegramLink {
  deepLink: string;
  botUsername: string;
  expiresInMinutes: number;
}

/**
 * Telegram linking — LIVE (M18). Status, begin-link (returns the deep link the
 * user taps), and disconnect. All behind the session token.
 */
export const telegramApi = {
  status: (): Promise<TelegramStatus> => apiGet<TelegramStatus>("/telegram/status"),
  link: (): Promise<TelegramLink> => apiSend<TelegramLink>("/telegram/link", undefined),
  unlink: (): Promise<void> => apiSend<void>("/telegram", undefined, "DELETE"),
};
