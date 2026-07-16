import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";

import { FeatureFlagsService } from "./application/configuration/feature-flags.service";
import { MaintenanceService } from "./application/maintenance/maintenance.service";
import { AuditService } from "./application/audit/audit.service";
import { SystemHealthService } from "./application/health/system-health.service";
import { PrometheusService } from "./application/metrics/prometheus.service";
import { AdminGuard } from "./infrastructure/admin.guard";
import { MaintenanceGuard } from "./infrastructure/maintenance.guard";

/* ── Fakes ─────────────────────────────────────────────────────────────── */

function fakePrisma() {
  const settings = new Map<string, { key: string; value: unknown }>();
  const audits: unknown[] = [];
  return {
    _settings: settings,
    _audits: audits,
    adminSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => settings.get(where.key) ?? null),
      findMany: vi.fn(async ({ where }: { where?: { key?: { startsWith?: string } } } = {}) => {
        const prefix = where?.key?.startsWith;
        return [...settings.values()].filter((s) => !prefix || s.key.startsWith(prefix));
      }),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { key: string; value: unknown }; update: { value: unknown } }) => {
        const existing = settings.get(where.key);
        const row = existing ? { key: where.key, value: update.value } : { key: create.key, value: create.value };
        settings.set(where.key, row);
        return row;
      }),
    },
    adminAudit: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        audits.push(data);
        return data;
      }),
      findMany: vi.fn(async () => audits.slice().reverse()),
    },
  };
}

function fakeAudit() {
  return { record: vi.fn(async () => undefined) } as unknown as AuditService;
}

function ctxFor(request: unknown) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

/* ── Feature flags — the kill switch and its safety rails ──────────────── */

describe("FeatureFlagsService", () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let audit: AuditService;
  let flags: FeatureFlagsService;

  beforeEach(async () => {
    prisma = fakePrisma();
    audit = fakeAudit();
    flags = new FeatureFlagsService(prisma as never, audit);
    await flags.onModuleInit();
  });

  it("an unknown flag is OFF — fail closed", () => {
    expect(flags.isEnabled("does.not.exist")).toBe(false);
  });

  it("a known default flag is ON", () => {
    expect(flags.isEnabled("signals.publish")).toBe(true);
  });

  it("the kill switch takes effect immediately and is persisted + audited", async () => {
    await flags.set("signals.publish", { enabled: false }, "admin@test");
    expect(flags.isEnabled("signals.publish")).toBe(false);
    expect(prisma.adminSetting.upsert).toHaveBeenCalled();
    expect((audit.record as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "feature-flag.set" }),
    );
  });

  it("rollout is deterministic: 0% is off, 100% is on, and a subject is stable", async () => {
    await flags.set("signals.publish", { rolloutPercent: 0 }, "a");
    expect(flags.isEnabled("signals.publish", "trader-1")).toBe(false);
    await flags.set("signals.publish", { rolloutPercent: 100 }, "a");
    expect(flags.isEnabled("signals.publish", "trader-1")).toBe(true);

    await flags.set("signals.publish", { rolloutPercent: 50 }, "a");
    const first = flags.isEnabled("signals.publish", "trader-1");
    const second = flags.isEnabled("signals.publish", "trader-1");
    expect(first).toBe(second); // same subject → same side, always
  });

  it("survives a restart by reloading persisted flags", async () => {
    await flags.set("signals.publish", { enabled: false }, "a");
    const reborn = new FeatureFlagsService(prisma as never, audit);
    await reborn.onModuleInit();
    expect(reborn.isEnabled("signals.publish")).toBe(false);
  });
});

/* ── Maintenance mode ──────────────────────────────────────────────────── */

describe("MaintenanceService", () => {
  it("enables, persists, disables, and audits every toggle", async () => {
    const prisma = fakePrisma();
    const audit = fakeAudit();
    const svc = new MaintenanceService(prisma as never, audit);
    await svc.onModuleInit();

    expect(svc.current().enabled).toBe(false);
    await svc.enable({ message: "back at 04:00 UTC" }, "admin@test");
    expect(svc.current().enabled).toBe(true);
    expect(svc.current().message).toBe("back at 04:00 UTC");

    await svc.disable("admin@test");
    expect(svc.current().enabled).toBe(false);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });
});

/* ── Audit — append-only by construction ───────────────────────────────── */

describe("AuditService", () => {
  it("writes append-only and exposes no way to mutate history", async () => {
    const prisma = fakePrisma();
    const svc = new AuditService(prisma as never);
    await svc.record({ action: "x.y", actor: "a", detail: "d", at: 1 });

    expect(prisma.adminAudit.create).toHaveBeenCalledOnce();
    // The service surface is record + recent only — no update, no delete.
    expect((svc as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((svc as unknown as Record<string, unknown>).delete).toBeUndefined();
  });
});

/* ── Admin guard — the interim boundary ────────────────────────────────── */

describe("AdminGuard", () => {
  const original = process.env.ADMIN_API_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = original;
  });

  /* The guard now takes a TokenService (M16). A verifier that accepts nothing
   * exercises the operator-token path exactly as before; one that mints roles
   * exercises the new human path. */
  const noJwt = { verify: () => null } as never;
  const jwtOf = (role: string) =>
    ({ verify: () => ({ sub: "u1", email: "a@x.com", role }) }) as never;

  it("is open in development when no token is set", () => {
    delete process.env.ADMIN_API_TOKEN;
    const guard = new AdminGuard({ isProduction: false } as never, noJwt);
    expect(guard.canActivate(ctxFor({ headers: {} }))).toBe(true);
  });

  it("fails closed in production when no token is set", () => {
    delete process.env.ADMIN_API_TOKEN;
    const guard = new AdminGuard({ isProduction: true } as never, noJwt);
    expect(() => guard.canActivate(ctxFor({ headers: {} }))).toThrow(ForbiddenException);
  });

  it("rejects a wrong token and accepts the right one", () => {
    process.env.ADMIN_API_TOKEN = "correct-horse-battery-staple-token";
    const guard = new AdminGuard({ isProduction: true } as never, noJwt);
    expect(() => guard.canActivate(ctxFor({ headers: { "x-admin-token": "wrong" } }))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctxFor({ headers: { "x-admin-token": "correct-horse-battery-staple-token" } }))).toBe(
      true,
    );
  });

  it("accepts a signed-in ADMIN's bearer token — the RBAC path", () => {
    delete process.env.ADMIN_API_TOKEN;
    const guard = new AdminGuard({ isProduction: true } as never, jwtOf("ADMIN"));
    expect(guard.canActivate(ctxFor({ headers: { authorization: "Bearer x.y.z" } }))).toBe(true);
  });

  it("refuses a TRADER's bearer token in production", () => {
    delete process.env.ADMIN_API_TOKEN;
    const guard = new AdminGuard({ isProduction: true } as never, jwtOf("TRADER"));
    expect(() =>
      guard.canActivate(ctxFor({ headers: { authorization: "Bearer x.y.z" } })),
    ).toThrow(ForbiddenException);
  });
});

/* ── Maintenance guard — graceful 503, operator never locked out ────────── */

describe("MaintenanceGuard", () => {
  function guardWith(state: { enabled: boolean; readOnly?: boolean; message?: string }) {
    const maintenance = { current: () => ({ readOnly: false, message: "", ...state }) } as unknown as MaintenanceService;
    return new MaintenanceGuard(maintenance);
  }

  it("passes everything when maintenance is off", () => {
    const guard = guardWith({ enabled: false });
    expect(guard.canActivate(ctxFor({ path: "/api/v1/signals/today", method: "GET" }))).toBe(true);
  });

  it("turns public requests away with a 503 when on", () => {
    const guard = guardWith({ enabled: true });
    expect(() => guard.canActivate(ctxFor({ path: "/api/v1/signals/today", method: "GET" }))).toThrow(
      ServiceUnavailableException,
    );
  });

  it("never locks out health, metrics, or the admin API", () => {
    const guard = guardWith({ enabled: true });
    expect(guard.canActivate(ctxFor({ path: "/health", method: "GET" }))).toBe(true);
    expect(guard.canActivate(ctxFor({ path: "/metrics", method: "GET" }))).toBe(true);
    expect(guard.canActivate(ctxFor({ path: "/api/v1/admin/maintenance", method: "POST" }))).toBe(true);
  });

  it("read-only mode lets reads through but rejects writes", () => {
    const guard = guardWith({ enabled: true, readOnly: true });
    expect(guard.canActivate(ctxFor({ path: "/api/v1/signals/today", method: "GET" }))).toBe(true);
    expect(() => guard.canActivate(ctxFor({ path: "/api/v1/signals", method: "POST" }))).toThrow(
      ServiceUnavailableException,
    );
  });
});

/* ── System health thresholds ──────────────────────────────────────────── */

describe("SystemHealthService", () => {
  it("reports a UTC process as clock-HEALTHY and a non-UTC one as CRITICAL", () => {
    const svc = new SystemHealthService();

    const prev = process.env.TZ;
    process.env.TZ = "UTC";
    const utc = svc.snapshot();
    expect(utc.clock.isUtc).toBe(true);
    expect(utc.checks.find((c) => c.name === "clock")?.status).toBe("HEALTHY");

    process.env.TZ = "America/New_York";
    const skewed = svc.snapshot();
    expect(skewed.clock.isUtc).toBe(false);
    expect(skewed.status).toBe("CRITICAL"); // a mis-bucketing clock is the worst kind
    process.env.TZ = prev;
  });

  it("snapshots a well-formed set of checks", () => {
    const svc = new SystemHealthService();
    process.env.TZ = "UTC";
    const snap = svc.snapshot();
    expect(snap.checks.map((c) => c.name).sort()).toEqual(["clock", "cpu", "event-loop", "memory"]);
    expect(snap.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

/* ── Prometheus exposition ─────────────────────────────────────────────── */

describe("PrometheusService", () => {
  it("renders process gauges, app gauges, and HTTP counters in Prometheus format", () => {
    const svc = new PrometheusService();
    svc.recordHttp("GET", 200);
    svc.recordHttp("GET", 500);

    const out = svc.render({ signals_published_this_run: 3 });
    expect(out).toContain("# TYPE process_resident_memory_bytes gauge");
    expect(out).toContain("aegis_signals_published_this_run 3");
    expect(out).toContain('http_requests_total{method="GET",status="2xx"} 1');
    expect(out).toContain("http_errors_total 1");
  });

  it("ignores non-finite app gauges", () => {
    const svc = new PrometheusService();
    const out = svc.render({ bad: Number.NaN, good: 1 });
    expect(out).not.toContain("aegis_bad");
    expect(out).toContain("aegis_good 1");
  });
});
