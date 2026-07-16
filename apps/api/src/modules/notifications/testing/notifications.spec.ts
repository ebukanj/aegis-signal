import { EventEmitter2 } from "@nestjs/event-emitter";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { Notification, NotificationPreferences, PublishedSignal } from "@aegis/contracts";

import { PreferenceResolver } from "../application/preferences/preference.resolver";
import { RetryPolicy } from "../application/retry/retry.policy";
import { TemplateRenderer } from "../application/templates/template.renderer";
import {
  NotificationOrchestrator,
  deliveryId,
} from "../application/orchestrator/notification.orchestrator";
import type { ChannelRegistry } from "../application/channels/channel.registry";
import type { DeliveryResult, INotificationChannel } from "../domain/channel";

/* ── A fake in-memory repository ───────────────────────────────────── */

class FakeRepo {
  rows = new Map<string, Notification>();

  async create(n: Notification) {
    if (this.rows.has(n.id)) return { created: false };
    this.rows.set(n.id, { ...n });
    return { created: true };
  }
  async updateStatus(id: string, status: Notification["status"], patch: Record<string, unknown> = {}) {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, status, ...patch } as Notification);
  }
  async byId(id: string) {
    return this.rows.get(id) ?? null;
  }
  async recentDuplicate(input: { recipient: string; type: string; subject: string | null; channel: string; since: number }) {
    return [...this.rows.values()].some(
      (r) =>
        r.recipient === input.recipient &&
        r.type === input.type &&
        r.subject === input.subject &&
        r.channel === input.channel &&
        r.createdAt >= input.since &&
        r.status !== "CANCELLED" &&
        r.status !== "SUPPRESSED",
    );
  }
}

/* ── A fake channel we can make succeed or fail ────────────────────── */

class FakeChannel implements INotificationChannel {
  sent: Notification[] = [];
  constructor(
    readonly channel: INotificationChannel["channel"],
    private behaviour: () => DeliveryResult,
    private configured = true,
  ) {}
  isConfigured() { return this.configured; }
  async health() { return { status: "AVAILABLE" as const, error: null }; }
  async send(n: Notification): Promise<DeliveryResult> {
    this.sent.push(n);
    return this.behaviour();
  }
}

function registryWith(channel: INotificationChannel): ChannelRegistry {
  return { get: (c: string) => (c === channel.channel ? channel : null) } as unknown as ChannelRegistry;
}

const renderer = new TemplateRenderer();
const message = renderer.system("Test", "body");

function orchestrator(channel: INotificationChannel, prefs?: Partial<NotificationPreferences>) {
  const repo = new FakeRepo();
  const resolver = new PreferenceResolver();
  if (prefs) {
    vi.spyOn(resolver, "preferencesFor").mockReturnValue({
      recipient: "default",
      enabledChannels: [channel.channel],
      minimumPriority: "LOW",
      quietHours: { enabled: false, startHour: 0, endHour: 0, allowCriticalBypass: true },
      timezone: "UTC",
      strategyFilter: [],
      watchlist: [],
      minimumConfidence: 0,
      ...prefs,
    });
  } else {
    vi.spyOn(resolver, "preferencesFor").mockReturnValue({
      recipient: "default",
      enabledChannels: [channel.channel],
      minimumPriority: "LOW",
      quietHours: { enabled: false, startHour: 0, endHour: 0, allowCriticalBypass: true },
      timezone: "UTC",
      strategyFilter: [],
      watchlist: [],
      minimumConfidence: 0,
    });
  }
  const orch = new NotificationOrchestrator(registryWith(channel), resolver, new RetryPolicy(), repo as never, new EventEmitter2());
  return { orch, repo };
}

const request = (over: Record<string, unknown> = {}) => ({
  type: "PRIME_SIGNAL" as const,
  priority: "HIGH" as const,
  message,
  dedupeKey: "sig:1",
  subject: "BTC",
  ...over,
});

/* ══════════════════════════════════════════════════════════════════════
 *  DELIVERY & EXACTLY-ONCE
 * ══════════════════════════════════════════════════════════════════════ */

describe("the orchestrator delivers", () => {
  it("delivers a notification on an enabled channel and marks it DELIVERED", async () => {
    const channel = new FakeChannel("IN_APP", () => ({ ok: true, providerResponse: "ok" }));
    const { orch, repo } = orchestrator(channel);

    const [id] = await orch.dispatch(request());
    expect(channel.sent).toHaveLength(1);
    expect((await repo.byId(id))?.status).toBe("DELIVERED");
  });

  it("is EXACTLY ONCE — re-dispatching the same event delivers nothing twice", async () => {
    const channel = new FakeChannel("IN_APP", () => ({ ok: true, providerResponse: "ok" }));
    const { orch } = orchestrator(channel);

    await orch.dispatch(request());
    await orch.dispatch(request()); // same dedupeKey → same delivery id

    /* The second dispatch hits the dedup window AND the deterministic id; the
     * channel is called once. */
    expect(channel.sent).toHaveLength(1);
  });

  it("the delivery id is deterministic per event, distinct across events", () => {
    expect(deliveryId("default", "PRIME_SIGNAL", "sig:1", "IN_APP")).toBe(
      deliveryId("default", "PRIME_SIGNAL", "sig:1", "IN_APP"),
    );
    expect(deliveryId("default", "PRIME_SIGNAL", "sig:1", "IN_APP")).not.toBe(
      deliveryId("default", "PRIME_SIGNAL", "sig:2", "IN_APP"),
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  PREFERENCES — only ever remove a delivery
 * ══════════════════════════════════════════════════════════════════════ */

describe("preferences suppress unwanted notifications", () => {
  it("SUPPRESSES a notification below the priority threshold", async () => {
    const channel = new FakeChannel("IN_APP", () => ({ ok: true, providerResponse: "ok" }));
    const { orch } = orchestrator(channel, { minimumPriority: "CRITICAL" });

    const ids = await orch.dispatch(request({ priority: "MEDIUM" }));
    expect(ids).toHaveLength(0);
    expect(channel.sent).toHaveLength(0);
  });

  it("SUPPRESSES a coin off the watchlist", async () => {
    const channel = new FakeChannel("IN_APP", () => ({ ok: true, providerResponse: "ok" }));
    const { orch } = orchestrator(channel, { watchlist: ["ETH"] });

    const ids = await orch.dispatch(request({ subject: "BTC" }));
    expect(ids).toHaveLength(0);
  });
});

describe("quiet hours", () => {
  const resolver = new PreferenceResolver();
  const prefs: NotificationPreferences = {
    recipient: "default",
    enabledChannels: ["IN_APP"],
    minimumPriority: "LOW",
    quietHours: { enabled: true, startHour: 22, endHour: 7, allowCriticalBypass: true },
    timezone: "UTC",
    strategyFilter: [],
    watchlist: [],
    minimumConfidence: 0,
  };

  it("recognises an overnight window that wraps midnight", () => {
    const at2am = Date.UTC(2026, 0, 1, 2, 0, 0);
    const at12pm = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(resolver.inQuietHours(prefs, at2am)).toBe(true);
    expect(resolver.inQuietHours(prefs, at12pm)).toBe(false);
  });

  it("lets CRITICAL pierce quiet hours, but holds MEDIUM", () => {
    const at2am = Date.UTC(2026, 0, 1, 2, 0, 0);
    const critical = resolver.resolve({ prefs, priority: "CRITICAL", coin: null, strategyId: null, confidence: null, now: at2am });
    const medium = resolver.resolve({ prefs, priority: "MEDIUM", coin: null, strategyId: null, confidence: null, now: at2am });
    expect(critical.channels).toEqual(["IN_APP"]);
    expect(medium.channels).toEqual([]);
    expect(medium.suppressedReason).toBe("quiet hours");
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  RETRY — trying vs giving up
 * ══════════════════════════════════════════════════════════════════════ */

describe("the retry policy", () => {
  const policy = new RetryPolicy();

  it("retries a transient failure, up to the cap", () => {
    expect(policy.shouldRetry(1, true)).toBe(true);
    expect(policy.shouldRetry(RetryPolicy.MAX_ATTEMPTS, true)).toBe(false);
  });

  it("NEVER retries a permanent failure — a provider that said no", () => {
    expect(policy.shouldRetry(1, false)).toBe(false);
  });

  it("backs off quadratically and deterministically", () => {
    expect(policy.delayMs(1)).toBe(1000);
    expect(policy.delayMs(2)).toBe(4000);
  });

  it("a permanent failure lands in FAILED without retrying", async () => {
    const channel = new FakeChannel("IN_APP", () => ({ ok: false, retryable: false, error: "bad address" }));
    const { orch, repo } = orchestrator(channel);
    const [id] = await orch.dispatch(request());
    expect((await repo.byId(id))?.status).toBe("FAILED");
    expect(channel.sent).toHaveLength(1); // no retry
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  UNCONFIGURED CHANNELS — skipped, not failed
 * ══════════════════════════════════════════════════════════════════════ */

describe("an unconfigured channel", () => {
  it("is CANCELLED, not FAILED — lose a provider without losing notifications", async () => {
    const channel = new FakeChannel("TELEGRAM", () => ({ ok: true, providerResponse: "ok" }), false);
    const { orch, repo } = orchestrator(channel);
    const [id] = await orch.dispatch(request());
    expect((await repo.byId(id))?.status).toBe("CANCELLED");
    expect(channel.sent).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 *  TEMPLATES — deterministic, execution-complete
 * ══════════════════════════════════════════════════════════════════════ */

describe("templates render deterministically", () => {
  const signal = {
    id: "sig:BTC:1h:LONG:1",
    symbol: "BTC",
    direction: "LONG",
    strategies: ["breakout"],
    timeframe: "1h",
    regime: "TRENDING_BULL",
    marketType: "PERPETUAL",
    suggestedLeverage: 5,
    entryPrice: 60000,
    stopLoss: 59000,
    takeProfits: [63000, 64500],
    confidence: { score: 88, displayedWinRate: 58, basis: "HISTORICAL" },
    confluence: { score: 74 },
  } as unknown as PublishedSignal;

  it("a prime signal carries entry, stop, targets, confidence and a link", () => {
    const a = renderer.primeSignal(signal);
    const b = renderer.primeSignal(signal);
    expect(a).toEqual(b); // deterministic
    expect(a.plain).toContain("60,000");
    expect(a.plain).toContain("59,000");
    expect(a.plain).toContain("58%");
    expect(a.link).toBe("/signals/sig:BTC:1h:LONG:1");
  });

  it("plain text has no markdown control chars", () => {
    expect(renderer.primeSignal(signal).plain).not.toContain("**");
  });

  it("maps event → priority (STOP_LOSS critical, DIGEST low)", () => {
    expect(renderer.priorityFor("STOP_LOSS")).toBe("CRITICAL");
    expect(renderer.priorityFor("DIGEST")).toBe("LOW");
  });
});

/* ── silence the setTimeout-based retry in tests ───────────────────── */
beforeEach(() => {
  vi.restoreAllMocks();
});
