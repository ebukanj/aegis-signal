import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { User as PrismaUser } from "@prisma/client";
import {
  userPreferencesSchema,
  type AuthResponse,
  type ChangePasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type UpdatePreferencesRequest,
  type User,
  type UserPreferences,
} from "@aegis/contracts";

import { UserRepository } from "../infrastructure/user.repository";
import { PasswordService } from "../domain/password.service";
import { TokenService } from "../domain/token.service";

/**
 * Identity, decided here and nowhere else.
 *
 * Registration, login, the password change, and the first-admin bootstrap all
 * live in this one service — the controller only translates HTTP to a call and a
 * call to HTTP. The rules that matter:
 *
 *   • The FIRST account to register becomes ADMIN. A fresh install has no
 *     operator, and forcing one to be seeded by hand is a step every self-hosted
 *     deploy would get wrong. Every account after the first is a TRADER.
 *
 *   • A login failure NEVER says which half was wrong. "No such email" and "wrong
 *     password" return the identical message, so the endpoint cannot be used to
 *     enumerate who has an account.
 *
 *   • The password hash never leaves this layer. Everything returned to a caller
 *     is the contract `User`, which has no hash field to leak.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    /* Optional so a unit test can construct the service without the event bus. In
     * the app it is always injected, and downstream engines (the notification
     * preferences cache) listen for the change rather than being called. */
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  async register(input: RegisterRequest): Promise<AuthResponse> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      // Registration CAN reveal an email is taken — it must, or two people could
      // not discover the collision. This is the one place enumeration is inherent.
      throw new ConflictException("An account with that email already exists");
    }

    // The bootstrap: the very first account owns the platform.
    const isFirst = (await this.users.count()) === 0;
    const role = isFirst ? "ADMIN" : "TRADER";

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash,
      role,
    });

    if (isFirst) {
      this.logger.log(`First account registered — ${user.email} is the platform ADMIN`);
    }

    return this.session(user);
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const user = await this.users.findByEmail(input.email);

    // Verify a hash even when the user does not exist, so a missing account and a
    // wrong password take the same time — no timing oracle for enumeration.
    const stored = user?.passwordHash ?? DUMMY_HASH;
    const ok = await this.passwords.verify(input.password, stored);

    if (!user || !ok) {
      throw new UnauthorizedException("Incorrect email or password");
    }

    return this.session(user);
  }

  async changePassword(userId: string, input: ChangePasswordRequest): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException("Not signed in");

    const ok = await this.passwords.verify(input.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Your current password is incorrect");

    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.users.updatePassword(userId, passwordHash);

    this.logger.log(`Password changed for ${user.email}`);
  }

  async me(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException("Not signed in");
    return toUser(user);
  }

  /* ── Preferences ─────────────────────────────────────────────────── */

  /** A user's preferences, always complete — missing fields fill from defaults. */
  async preferences(userId: string): Promise<UserPreferences> {
    const stored = await this.users.getPreferences(userId);
    // Parsing an empty/partial blob through the schema yields every default, so a
    // brand-new user has working preferences and an old blob never fails to load.
    return userPreferencesSchema.parse(stored ?? {});
  }

  /** Merge an update over the current preferences and persist the whole document. */
  async updatePreferences(
    userId: string,
    patch: UpdatePreferencesRequest,
  ): Promise<UserPreferences> {
    const current = await this.preferences(userId);
    const merged = userPreferencesSchema.parse({ ...current, ...patch });
    await this.users.upsertPreferences(userId, merged);
    // The notification layer keeps a cache of who wants what, on which channel —
    // it refreshes this user when it hears this.
    this.events?.emit("user.preferences.changed", { userId, preferences: merged });
    return merged;
  }

  /** Every user's id + preferences — for the notification preferences cache. */
  async allPreferences(): Promise<{ userId: string; preferences: UserPreferences }[]> {
    const rows = await this.users.allPreferences();
    return rows.map((row) => ({
      userId: row.userId,
      preferences: userPreferencesSchema.parse(row.data ?? {}),
    }));
  }

  /* ── Watchlist ───────────────────────────────────────────────────── */

  async watchlist(userId: string): Promise<string[]> {
    return (await this.preferences(userId)).watchlist;
  }

  /** Add a coin (idempotent, order-preserving). Returns the new watchlist. */
  async addToWatchlist(userId: string, coin: string): Promise<string[]> {
    const current = await this.preferences(userId);
    if (current.watchlist.includes(coin)) return current.watchlist;
    const next = [...current.watchlist, coin];
    await this.updatePreferences(userId, { watchlist: next });
    return next;
  }

  /** Remove a coin. Returns the new watchlist. */
  async removeFromWatchlist(userId: string, coin: string): Promise<string[]> {
    const current = await this.preferences(userId);
    const next = current.watchlist.filter((c) => c !== coin);
    await this.updatePreferences(userId, { watchlist: next });
    return next;
  }

  /* ── Helpers ─────────────────────────────────────────────────────── */

  private session(user: PrismaUser): AuthResponse {
    const { token, expiresAt } = this.tokens.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    // The contract carries the expiry as an ISO timestamp; the token service works
    // in epoch millis. Convert at the boundary.
    return {
      user: toUser(user),
      accessToken: token,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
}

/** Map a row to the public contract shape — the hash is dropped here, by design. */
function toUser(user: PrismaUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * A valid scrypt hash of a random string nobody knows. Verified against when the
 * email does not exist, purely so the timing matches a real verification.
 */
const DUMMY_HASH =
  "00000000000000000000000000000000:" +
  "0000000000000000000000000000000000000000000000000000000000000000" +
  "0000000000000000000000000000000000000000000000000000000000000000";
