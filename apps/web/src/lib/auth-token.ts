/**
 * The session token, stored where both the HTTP layer and React can reach it.
 *
 * `lib/api.ts` is plain functions with no access to React state, but every
 * request needs the bearer token. So the token lives here — cached in memory for
 * speed, mirrored to localStorage so a refresh keeps you signed in — and both the
 * fetch layer and the auth store read/write through this one module. One source
 * of truth for "am I signed in", reachable from anywhere.
 */
const STORAGE_KEY = "aegis.session.token";

let cached: string | null | undefined;

export function getToken(): string | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;
  cached = window.localStorage.getItem(STORAGE_KEY);
  return cached;
}

export function setToken(token: string | null): void {
  cached = token;
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(STORAGE_KEY, token);
  else window.localStorage.removeItem(STORAGE_KEY);
}
