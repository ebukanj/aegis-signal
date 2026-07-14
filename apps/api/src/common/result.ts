/**
 * Result — an outcome that might have failed, in the type system.
 *
 * Exceptions are for the *unexpected*. But most of what this platform does has
 * expected failures that are not exceptional at all: a strategy finds nothing, a
 * candidate fails the liquidity gate, a signal is a duplicate. Those are answers,
 * not accidents, and throwing for them means the caller can silently forget to
 * catch — and a forgotten catch in a risk gate is a trade that should not exist.
 *
 * A Result cannot be ignored. You have to look inside it.
 */

export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isOk<T, E>(
  result: Result<T, E>,
): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(
  result: Result<T, E>,
): result is { ok: false; error: E } {
  return !result.ok;
}

/** Unwrap, or throw. Use only where a failure genuinely is exceptional. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error instanceof Error
    ? result.error
    : new Error(String(result.error));
}

/** Unwrap, or fall back. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}
