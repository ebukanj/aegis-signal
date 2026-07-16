import { create } from "zustand";
import type { User } from "@aegis/contracts";
import { getToken, setToken } from "@/lib/auth-token";

type Status = "loading" | "authenticated" | "anonymous";

interface AuthState {
  user: User | null;
  /**
   * `loading` until we know — the app boots not knowing whether the token in
   * storage is still valid, and rendering a signed-in or signed-out UI before we
   * do would flash the wrong thing. The guard waits for a definite answer.
   */
  status: Status;

  /** A fresh session from login/register. Persists the token and marks us in. */
  setSession: (user: User, token: string) => void;
  /** Hydration result: the user `/auth/me` returned, or null if the token was dead. */
  resolve: (user: User | null) => void;
  signOut: () => void;
}

/**
 * Who is signed in, app-wide. The token itself lives in `lib/auth-token` (so the
 * fetch layer can read it without React); this store holds the USER and the
 * resolved status the UI renders from.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",

  setSession: (user, token) => {
    setToken(token);
    set({ user, status: "authenticated" });
  },

  resolve: (user) =>
    set({ user, status: user ? "authenticated" : "anonymous" }),

  signOut: () => {
    setToken(null);
    set({ user: null, status: "anonymous" });
  },
}));

/** Is there a token on disk at all? Cheap synchronous check for first paint. */
export const hasStoredToken = (): boolean => getToken() !== null;
