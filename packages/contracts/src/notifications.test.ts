import { describe, expect, it } from "vitest";
import {
  notificationSchema,
  notificationPreferencesSchema,
  deliveryStatusSchema,
} from "./notifications";

const message = {
  title: "Prime signal: BTC long",
  markdown: "**BTC** long — entry 60,000",
  plain: "BTC long — entry 60,000",
  link: "/signals/x",
};

const notification = {
  id: "ntf:x",
  type: "PRIME_SIGNAL" as const,
  priority: "HIGH" as const,
  channel: "IN_APP" as const,
  recipient: "default",
  subject: "BTC",
  message,
  status: "QUEUED" as const,
  attempts: 0,
  providerResponse: null,
  createdAt: 1_700_000_000_000,
  scheduledFor: 1_700_000_000_000,
  deliveredAt: null,
};

describe("the notification delivery record", () => {
  it("accepts a queued notification", () => {
    expect(notificationSchema.parse(notification).status).toBe("QUEUED");
  });

  it("distinguishes RETRYING from FAILED — trying vs gave up", () => {
    /* The whole point of the richer lifecycle: a transient retry is not a death,
     * and reporting them the same way would make a recoverable blip look permanent. */
    expect(deliveryStatusSchema.options).toContain("RETRYING");
    expect(deliveryStatusSchema.options).toContain("FAILED");
    expect(deliveryStatusSchema.options).toContain("SUPPRESSED");
  });

  it("carries both markdown and plain text so a channel picks what it can show", () => {
    const n = notificationSchema.parse(notification);
    expect(n.message.markdown).toContain("**");
    expect(n.message.plain).not.toContain("**");
  });
});

describe("notification preferences", () => {
  it("accepts a coherent default profile", () => {
    const prefs = notificationPreferencesSchema.parse({
      recipient: "default",
      enabledChannels: ["IN_APP"],
      minimumPriority: "MEDIUM",
      quietHours: { enabled: true, startHour: 22, endHour: 7, allowCriticalBypass: true },
      timezone: "UTC",
      strategyFilter: [],
      watchlist: [],
      minimumConfidence: 0,
    });
    expect(prefs.enabledChannels).toEqual(["IN_APP"]);
  });

  it("allows an empty enabledChannels — that is 'notify me about nothing'", () => {
    const parsed = notificationPreferencesSchema.safeParse({
      recipient: "default",
      enabledChannels: [],
      minimumPriority: "LOW",
      quietHours: { enabled: false, startHour: 0, endHour: 0, allowCriticalBypass: false },
      timezone: "UTC",
      strategyFilter: [],
      watchlist: [],
      minimumConfidence: 0,
    });
    expect(parsed.success).toBe(true);
  });
});
