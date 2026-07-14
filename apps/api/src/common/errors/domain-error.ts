/**
 * Domain errors.
 *
 * The domain layer must never know that HTTP exists (Clean Architecture —
 * dependencies point inward). So it throws these, and exactly one place — the
 * global exception filter — decides what status code the outside world sees.
 *
 * The alternative is a domain service importing `NotFoundException` from NestJS,
 * at which point the business rules depend on the web framework and the whole
 * architecture is decorative.
 */

export type DomainErrorCode =
  /** The caller asked for something that is not there. */
  | "NOT_FOUND"
  /** The caller's input is malformed or contradictory. */
  | "INVALID_INPUT"
  /** A business rule forbids this, and the caller is not wrong to have asked. */
  | "RULE_VIOLATION"
  /** A precondition of the system is not met (feed missing, engine not ready). */
  | "PRECONDITION_FAILED"
  /** The caller may not do this. */
  | "FORBIDDEN"
  /** Someone else already did it. */
  | "CONFLICT"
  /** A dependency we do not control failed (exchange, AI provider). */
  | "UPSTREAM_FAILURE";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** Safe to show a user. Never leak internals. */
  readonly detail?: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    message: string,
    detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.detail = detail;
    Error.captureStackTrace?.(this, DomainError);
  }

  static notFound(what: string, id?: string) {
    return new DomainError(
      "NOT_FOUND",
      id ? `${what} "${id}" does not exist` : `${what} does not exist`,
    );
  }

  static invalid(message: string, detail?: Record<string, unknown>) {
    return new DomainError("INVALID_INPUT", message, detail);
  }

  static rule(message: string, detail?: Record<string, unknown>) {
    return new DomainError("RULE_VIOLATION", message, detail);
  }

  static precondition(message: string, detail?: Record<string, unknown>) {
    return new DomainError("PRECONDITION_FAILED", message, detail);
  }

  static forbidden(message = "You may not do that") {
    return new DomainError("FORBIDDEN", message);
  }

  static conflict(message: string, detail?: Record<string, unknown>) {
    return new DomainError("CONFLICT", message, detail);
  }

  static upstream(who: string, message: string) {
    return new DomainError("UPSTREAM_FAILURE", `${who}: ${message}`);
  }
}

/** The only place that maps domain vocabulary onto HTTP. */
export const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  RULE_VIOLATION: 422,
  PRECONDITION_FAILED: 412,
  FORBIDDEN: 403,
  CONFLICT: 409,
  UPSTREAM_FAILURE: 502,
};
