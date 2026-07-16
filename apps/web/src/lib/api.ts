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

/**
 * The admin token, if one is configured for this browser build.
 *
 * In development the API's admin guard is open, so this is usually unset and the
 * admin console just works. In production the guard demands the token — and a token
 * baked into a public bundle is a token everyone has, which is why real admin auth
 * (roles, sessions) arrives with the Users milestone and retires this. Until then
 * this is the honest interim: present only where an operator has deliberately set it.
 */
function adminHeaders(): Record<string, string> {
  const token = process.env.NEXT_PUBLIC_ADMIN_TOKEN;
  return token ? { "x-admin-token": token } : {};
}

/** A POST against the versioned API. `path` is relative to `/api/v1`. */
export async function apiSend<T>(
  path: string,
  body: unknown,
  method: "POST" | "PATCH" | "DELETE" = "POST",
): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    method,
    headers: { accept: "application/json", "content-type": "application/json", ...adminHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    let code = "HTTP_ERROR";
    let message = `${response.status} ${response.statusText}`;
    try {
      const parsed = await response.json();
      if (parsed?.error) {
        code = parsed.error.code ?? code;
        message = parsed.error.message ?? message;
      }
    } catch {
      /* Non-JSON error body — keep the status line. */
    }
    throw new ApiError(response.status, code, message);
  }

  return response.json() as Promise<T>;
}

/** A GET that carries the admin token (admin reads are guarded too). */
export async function apiGetAdmin<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { accept: "application/json", ...adminHeaders() },
  });
  if (!response.ok) {
    let code = "HTTP_ERROR";
    let message = `${response.status} ${response.statusText}`;
    try {
      const parsed = await response.json();
      if (parsed?.error) {
        code = parsed.error.code ?? code;
        message = parsed.error.message ?? message;
      }
    } catch {
      /* keep status line */
    }
    throw new ApiError(response.status, code, message);
  }
  return response.json() as Promise<T>;
}
