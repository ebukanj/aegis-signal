import { describe, expect, it } from "vitest";
import { userPreferencesSchema, type UserPreferences } from "@aegis/contracts";

import { NotificationPreferencesProvider } from "../application/preferences/notification-preferences.provider";
import { TelegramService } from "../application/telegram/telegram.service";
import type { AuthService } from "../../auth/application/auth.service";
import type { TelegramClient } from "../infrastructure/telegram/telegram.client";
import type { AppConfigService } from "../../../config/app-config.service";

function prefs(
  over: Omit<Partial<UserPreferences>, "notifications"> & {
    notifications?: Partial<UserPreferences["notifications"]>;
  },
): UserPreferences {
  return userPreferencesSchema.parse({
    ...over,
    notifications: { ...over.notifications },
  });
}

describe("NotificationPreferencesProvider — the Telegram delivery policy", () => {
  const provider = new NotificationPreferencesProvider({} as AuthService);

  // Linked + telegram on, watches BTC.
  provider.onChanged({
    userId: "u-btc",
    preferences: prefs({
      telegramChatId: "111",
      watchlist: ["BTC"],
      notifications: { telegram: true },
    }),
  });
  // Linked + telegram on, no watchlist.
  provider.onChanged({
    userId: "u-none",
    preferences: prefs({ telegramChatId: "222", notifications: { telegram: true } }),
  });
  // Linked but telegram DISABLED.
  provider.onChanged({
    userId: "u-off",
    preferences: prefs({ telegramChatId: "333", watchlist: ["BTC"], notifications: { telegram: false } }),
  });

  it("sends a watched coin to the watcher, not to others", () => {
    const targets = provider.telegramTargetsFor("BTC", false).map((t) => t.userId);
    expect(targets).toContain("u-btc");
    expect(targets).not.toContain("u-none"); // no watchlist, not prime → nothing
    expect(targets).not.toContain("u-off"); // channel disabled
  });

  it("sends a PRIME signal to everyone linked, regardless of watchlist", () => {
    const targets = provider.telegramTargetsFor("XRP", true).map((t) => t.userId);
    expect(new Set(targets)).toEqual(new Set(["u-btc", "u-none"]));
  });

  it("never targets a user whose Telegram channel is off", () => {
    expect(provider.telegramTargetsFor("BTC", true).map((t) => t.userId)).not.toContain("u-off");
  });

  it("exposes the linked chat id for the channel to send to", () => {
    expect(provider.chatIdFor("u-btc")).toBe("111");
    expect(provider.chatIdFor("nobody")).toBeNull();
  });
});

describe("TelegramService — single-use link codes", () => {
  const client = { isConfigured: () => true, getUsername: async () => "aegis_bot" } as unknown as TelegramClient;
  const auth = {} as AuthService;
  const config = { notifications: { telegramBotUsername: undefined } } as unknown as AppConfigService;

  it("mints a deep link and redeems its code exactly once", async () => {
    const service = new TelegramService(client, auth, config);
    const { deepLink } = await service.beginLink("user-1");

    expect(deepLink).toContain("t.me/aegis_bot?start=");
    const code = new URL(deepLink).searchParams.get("start")!;

    expect(service.redeemCode(code)).toBe("user-1");
    expect(service.redeemCode(code)).toBeNull(); // already consumed
  });

  it("rejects an unknown code", () => {
    const service = new TelegramService(client, auth, config);
    expect(service.redeemCode("nope")).toBeNull();
  });
});
