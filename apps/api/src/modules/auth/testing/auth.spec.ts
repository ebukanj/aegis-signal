import { describe, expect, it, beforeEach } from "vitest";
import { ConflictException, UnauthorizedException } from "@nestjs/common";
import type { User as PrismaUser } from "@prisma/client";

import { PasswordService } from "../domain/password.service";
import { TokenService } from "../domain/token.service";
import { AuthService } from "../application/auth.service";
import { WatchlistService } from "../application/watchlist.service";
import type { UserRepository } from "../infrastructure/user.repository";
import type { AppConfigService } from "../../../config/app-config.service";

/* ── A fake config: just the auth secret + TTL the TokenService reads. ── */
function fakeConfig(ttlSeconds = 3600): AppConfigService {
  return {
    auth: { jwtSecret: "a-perfectly-adequate-test-secret-value", jwtTtlSeconds: ttlSeconds },
  } as unknown as AppConfigService;
}

function token(ttlSeconds = 3600): TokenService {
  const t = new TokenService(fakeConfig(ttlSeconds));
  t.onModuleInit();
  return t;
}

/* ── An in-memory user repository. ── */
function fakeRepo() {
  const rows: PrismaUser[] = [];
  const prefs = new Map<string, unknown>();
  let id = 0;

  return {
    rows,
    count: async () => rows.length,
    findByEmail: async (email: string) =>
      rows.find((r) => r.email === email.toLowerCase()) ?? null,
    findById: async (uid: string) => rows.find((r) => r.id === uid) ?? null,
    create: async (input: { email: string; name: string; passwordHash: string; role: string }) => {
      const row = {
        id: `u${(id += 1)}`,
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash: input.passwordHash,
        role: input.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as PrismaUser;
      rows.push(row);
      return row;
    },
    updatePassword: async (uid: string, passwordHash: string) => {
      const row = rows.find((r) => r.id === uid)!;
      row.passwordHash = passwordHash;
      return row;
    },
    getPreferences: async (uid: string) => (prefs.get(uid) ?? null) as never,
    upsertPreferences: async (uid: string, data: unknown) => {
      prefs.set(uid, data);
    },
    allPreferences: async () => [...prefs.entries()].map(([userId, data]) => ({ userId, data })),
  } as unknown as UserRepository;
}

function service(repo = fakeRepo()): { auth: AuthService; repo: UserRepository } {
  const auth = new AuthService(repo, new PasswordService(), token());
  return { auth, repo };
}

describe("PasswordService", () => {
  const passwords = new PasswordService();

  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await passwords.hash("Sup3rSecret");
    expect(await passwords.verify("Sup3rSecret", hash)).toBe(true);
    expect(await passwords.verify("wrong", hash)).toBe(false);
  });

  it("salts: the same password hashes differently every time", async () => {
    const a = await passwords.hash("Sup3rSecret");
    const b = await passwords.hash("Sup3rSecret");
    expect(a).not.toBe(b);
    expect(await passwords.verify("Sup3rSecret", a)).toBe(true);
    expect(await passwords.verify("Sup3rSecret", b)).toBe(true);
  });
});

describe("TokenService", () => {
  it("round-trips claims through sign/verify", () => {
    const t = token();
    const { token: jwt } = t.sign({ sub: "u1", email: "a@b.com", role: "ADMIN" });
    expect(t.verify(jwt)).toMatchObject({ sub: "u1", role: "ADMIN" });
  });

  it("rejects a tampered token", () => {
    const t = token();
    const { token: jwt } = t.sign({ sub: "u1", email: "a@b.com", role: "TRADER" });
    // Flip the payload so the signature no longer matches.
    const parts = jwt.split(".");
    const forged = `${parts[0]}.${Buffer.from('{"sub":"u1","role":"ADMIN"}').toString("base64url")}.${parts[2]}`;
    expect(t.verify(forged)).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = token(-1); // already expired
    const { token: jwt } = t.sign({ sub: "u1", email: "a@b.com", role: "TRADER" });
    expect(t.verify(jwt)).toBeNull();
  });
});

describe("AuthService", () => {
  let auth: AuthService;

  beforeEach(() => {
    ({ auth } = service());
  });

  it("makes the FIRST account an ADMIN and the rest TRADERs", async () => {
    const first = await auth.register({ name: "Owner", email: "owner@x.com", password: "Passw0rd" });
    expect(first.user.role).toBe("ADMIN");

    const second = await auth.register({ name: "Trader", email: "t@x.com", password: "Passw0rd" });
    expect(second.user.role).toBe("TRADER");
  });

  it("returns a working session token on register", async () => {
    const res = await auth.register({ name: "Owner", email: "owner@x.com", password: "Passw0rd" });
    expect(res.accessToken.split(".")).toHaveLength(3);
    expect(res.user).not.toHaveProperty("passwordHash");
  });

  it("refuses a duplicate email", async () => {
    await auth.register({ name: "A", email: "dupe@x.com", password: "Passw0rd" });
    await expect(
      auth.register({ name: "B", email: "dupe@x.com", password: "Passw0rd" }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("logs in with the right password and refuses the wrong one", async () => {
    await auth.register({ name: "A", email: "a@x.com", password: "Passw0rd" });
    const ok = await auth.login({ email: "a@x.com", password: "Passw0rd" });
    expect(ok.user.email).toBe("a@x.com");

    await expect(auth.login({ email: "a@x.com", password: "nope" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("does not reveal whether an email exists (same error either way)", async () => {
    await expect(auth.login({ email: "ghost@x.com", password: "whatever" })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("changes a password only with the correct current one", async () => {
    const { user } = await auth.register({ name: "A", email: "a@x.com", password: "Passw0rd" });

    await expect(
      auth.changePassword(user.id, { currentPassword: "wrong", newPassword: "N3wPassword" }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await auth.changePassword(user.id, { currentPassword: "Passw0rd", newPassword: "N3wPassword" });
    const ok = await auth.login({ email: "a@x.com", password: "N3wPassword" });
    expect(ok.user.id).toBe(user.id);
  });

  it("fills preferences with defaults and merges updates", async () => {
    const { user } = await auth.register({ name: "A", email: "a@x.com", password: "Passw0rd" });

    const defaults = await auth.preferences(user.id);
    expect(defaults.accountEquity).toBe(10_000);
    expect(defaults.notifications.inApp).toBe(true);

    const updated = await auth.updatePreferences(user.id, { riskPerTrade: 2, watchlist: ["BTC"] });
    expect(updated.riskPerTrade).toBe(2);
    expect(updated.watchlist).toEqual(["BTC"]);
    // Unspecified fields keep their defaults.
    expect(updated.accountEquity).toBe(10_000);
  });

  it("manages a watchlist: add is idempotent, remove works", async () => {
    const { user } = await auth.register({ name: "A", email: "a@x.com", password: "Passw0rd" });

    expect(await auth.watchlist(user.id)).toEqual([]);

    await auth.addToWatchlist(user.id, "BTC");
    await auth.addToWatchlist(user.id, "SOL");
    expect(await auth.addToWatchlist(user.id, "BTC")).toEqual(["BTC", "SOL"]); // no duplicate

    expect(await auth.removeFromWatchlist(user.id, "BTC")).toEqual(["SOL"]);
  });
});

describe("WatchlistService", () => {
  it("unions every user's watched coins for the scan", async () => {
    const repo = fakeRepo();
    const auth = new AuthService(repo, new PasswordService(), token());
    const watchlist = new WatchlistService(repo);

    const a = await auth.register({ name: "A", email: "a@x.com", password: "Passw0rd" });
    const b = await auth.register({ name: "B", email: "b@x.com", password: "Passw0rd" });

    await auth.addToWatchlist(a.user.id, "BTC");
    await auth.addToWatchlist(a.user.id, "ETH");
    await auth.addToWatchlist(b.user.id, "ETH"); // overlap
    await auth.addToWatchlist(b.user.id, "SOL");

    const union = await watchlist.union();
    expect(new Set(union)).toEqual(new Set(["BTC", "ETH", "SOL"]));

    expect(new Set(await watchlist.watchersOf("ETH"))).toEqual(
      new Set([a.user.id, b.user.id]),
    );
  });
});
