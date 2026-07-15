/**
 * The one place the frontend talks to the backend over HTTP.
 *
 * Every feature's `*-api.ts` goes through this, so there is a single definition of
 * the base URL, the error shape, and how a failed request surfaces. The API wraps
 * its errors in `{ error: { code, message, ... } }` (ADR-022); this unwraps that
 * into a thrown `ApiError` a React Query `queryFn` can react to.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** A GET against the versioned API. `path` is relative to `/api/v1`. */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    let code = "HTTP_ERROR";
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body?.error) {
        code = body.error.code ?? code;
        message = body.error.message ?? message;
      }
    } catch {
      /* Non-JSON error body — keep the status line. */
    }
    throw new ApiError(response.status, code, message);
  }

  return response.json() as Promise<T>;
}
