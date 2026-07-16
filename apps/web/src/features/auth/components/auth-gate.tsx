"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authApi } from "@/features/auth/api/auth-api";
import { useAuthStore, hasStoredToken } from "@/features/auth/stores/auth-store";
import { setToken } from "@/lib/auth-token";

/**
 * The wall around the platform. Everything inside `(platform)` renders only for a
 * signed-in user.
 *
 * On mount it resolves the session exactly once: if a token is on disk it asks
 * `/auth/me` whether it is still good, and either hydrates the user or clears a
 * dead token. Until that answer arrives it shows a loader rather than flashing a
 * signed-out UI at someone who is, in fact, signed in. When the verdict is
 * "anonymous" it redirects to the login page.
 *
 * This is a client-side guard for UX — the real enforcement is server-side, where
 * every protected endpoint checks the token itself (a guard you can bypass in the
 * browser protects nothing; this one just spares a signed-out user a wall of failed
 * requests).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const resolve = useAuthStore((s) => s.resolve);

  useEffect(() => {
    if (!hasStoredToken()) {
      resolve(null);
      return;
    }
    authApi
      .me()
      .then((user) => resolve(user))
      .catch(() => {
        setToken(null);
        resolve(null);
      });
  }, [resolve]);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  return <>{children}</>;
}
