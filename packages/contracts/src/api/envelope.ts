import { z } from "zod";
import { timestampSchema, uuidSchema } from "../common/value-objects";

/**
 * The shape of every API response.
 *
 * One envelope, always. A client that has to ask "is this the bare object, or is
 * it wrapped?" has to branch, and a branch it gets wrong is a runtime error in a
 * place that reads perfectly.
 */

/* ── Errors ────────────────────────────────────────────────────────── */

/**
 * Every error code the API can return.
 *
 * A closed enum, not a free string. A client that wants to behave differently on
 * a rate-limit than on a validation failure must be able to *switch* on this —
 * and it cannot switch on `string`.
 */
export const errorCodeSchema = z.enum([
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RULE_VIOLATION",
  "PRECONDITION_FAILED",
  "RATE_LIMITED",
  "UPSTREAM_FAILURE",
  "UNAVAILABLE",

  /* Domain-specific — the caller is entitled to know exactly which rule bit. */
  "RISK_VIOLATION",
  "STRATEGY_DISABLED",
  "STRATEGY_UNPROVEN",
  "EXCHANGE_UNAVAILABLE",
  "CALIBRATION_UNAVAILABLE",
  "CONFIDENCE_UNAVAILABLE",
  "PATTERN_NOT_SUPPORTED",

  /* Ours. */
  "CONTRACT_VIOLATION",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const fieldViolationSchema = z.object({
  field: z.string(),
  message: z.string(),
});
export type FieldViolation = z.infer<typeof fieldViolationSchema>;

/**
 * An error response.
 *
 * `requestId` is the thread that joins a user's complaint to a log line. A user
 * can quote it; we can find the exact request. Without it, "it broke this
 * morning" is an archaeology project.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    /** Safe to show a user. Never leaks a table name, a query, or a path. */
    message: z.string(),
    /** Field-level detail for validation failures. */
    violations: z.array(fieldViolationSchema).optional(),
    requestId: z.string(),
    timestamp: timestampSchema,
    path: z.string(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/* ── Success ───────────────────────────────────────────────────────── */

export const metaSchema = z.object({
  requestId: uuidSchema,
  timestamp: timestampSchema,
  /** API version that served this. */
  version: z.string(),
});
export type Meta = z.infer<typeof metaSchema>;

/**
 * `successResponse(signalDetailSchema)` → a schema for `{ data, meta }`.
 *
 * A function rather than a type, so the *runtime* schema is generic too. A
 * generic TypeScript type alone would give compile-time safety and no validation
 * — which is the exact half-measure ADR-022 exists to prevent.
 */
export function successResponse<T extends z.ZodType>(data: T) {
  return z.object({
    data,
    meta: metaSchema,
  });
}
export type SuccessResponse<T> = { data: T; meta: Meta };

/* ── Pagination ────────────────────────────────────────────────────── */

export const pageInfoSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
});
export type PageInfo = z.infer<typeof pageInfoSchema>;

/**
 * The signal ledger only ever grows and is never deleted (06-STRATEGIES §5), so
 * every list over it is paginated from day one. An endpoint that returns "all
 * signals" is fine for a week and a catastrophe by month three.
 */
export function paginatedResponse<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    page: pageInfoSchema,
    meta: metaSchema,
  });
}
export type PaginatedResponse<T> = {
  data: T[];
  page: PageInfo;
  meta: Meta;
};

/* ── Health ────────────────────────────────────────────────────────── */

export const healthStatusSchema = z.enum(["ok", "degraded", "down"]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  checks: z.record(
    z.string(),
    z.object({
      status: z.enum(["up", "down"]),
      latencyMs: z.number().nonnegative().optional(),
      message: z.string().optional(),
    }),
  ),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const versionResponseSchema = z.object({
  service: z.string(),
  version: z.string(),
  commit: z.string(),
  environment: z.enum(["development", "test", "production"]),
  timezone: z.string(),
  uptimeSeconds: z.number().int().nonnegative(),
  timestamp: timestampSchema,
});
export type VersionResponse = z.infer<typeof versionResponseSchema>;
