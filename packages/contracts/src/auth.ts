import { z } from "zod";
import { timestampSchema } from "./domain";
import { userRoleSchema } from "./enums/platform";

/**
 * Identity & access (M16).
 *
 * The one place the shape of a user, a session and a user's preferences is
 * defined. Both apps import it; neither redeclares it (AGENTS.md §6). The
 * password RULES live here too, so the browser and the API validate the same
 * policy — the frontend for a fast error, the backend because it is the only one
 * that is trusted.
 */

/* ── The user, as everyone else sees them ──────────────────────────── */

/** A user, minus anything secret. The password hash NEVER leaves the backend. */
export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
  role: userRoleSchema,
  createdAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;

/* ── The password policy — one definition, both apps ───────────────── */

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200, "Password is too long")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[0-9]/, "Include at least one number");

/* ── Requests ──────────────────────────────────────────────────────── */

export const registerRequestSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(64),
  email: z.email("Enter a valid email address"),
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, "Your current password is required"),
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/* ── The session ───────────────────────────────────────────────────── */

/**
 * What a successful login/register returns: the user, and a bearer token to
 * carry on every subsequent request. The token is opaque to the frontend — it
 * stores it and sends it back; only the backend reads it.
 */
export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  /** When the token stops being accepted. The client re-authenticates before this. */
  expiresAt: timestampSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/* ── Per-user preferences ──────────────────────────────────────────── */

/**
 * A user's own settings, stored as one document (the DB holds a JSON blob; this
 * is its shape). Everything is optional with a sensible default, so a brand-new
 * account has working preferences and old blobs never fail to parse when a new
 * field is added — forward and backward compatible by construction.
 */
export const userPreferencesSchema = z.object({
  /** Position sizing defaults the signal detail pre-fills. */
  accountEquity: z.number().positive().default(10_000),
  riskPerTrade: z.number().positive().max(100).default(1),

  /** Which channels this user wants Prime signals delivered on. */
  notifications: z
    .object({
      inApp: z.boolean().default(true),
      telegram: z.boolean().default(false),
      email: z.boolean().default(false),
      /** Quiet hours in the user's local time, 24h. Null = no quiet hours. */
      quietHours: z
        .object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) })
        .nullable()
        .default(null),
    })
    .default(() => ({
      inApp: true,
      telegram: false,
      email: false,
      quietHours: null,
    })),

  /** Coins the platform watches as PRIORITY for this user (Phase 3). */
  watchlist: z.array(z.string()).default([]),

  /** Telegram chat id, once the user has linked the bot (Phase 4). */
  telegramChatId: z.string().nullable().default(null),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/** A preferences update — any subset of the fields. */
export const updatePreferencesRequestSchema = userPreferencesSchema.partial();
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequestSchema>;
