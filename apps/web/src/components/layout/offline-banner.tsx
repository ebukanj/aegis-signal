"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * You are offline — and the prices on this screen are lying to you.
 *
 * For most products, losing connection is an inconvenience. For a trading
 * terminal it is a hazard: every price, every signal, every "still at entry"
 * verdict on screen was true when it last loaded and may be worthless now. A
 * trader acting on a frozen quote is acting on fiction.
 *
 * So this does not politely say "connection lost". It says the prices are stale
 * and names the consequence, because that is the only part that matters.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();

    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-xs font-medium text-destructive-foreground"
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      <span>
        You are offline. Every price on screen is frozen — do not trade on them.
      </span>
    </div>
  );
}
