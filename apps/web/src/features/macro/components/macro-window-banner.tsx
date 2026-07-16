"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { macroApi } from "@/features/macro/api/macro-api";

/**
 * A heads-up on the Signals page when a high-impact macro release is imminent or
 * just printed. It renders nothing the rest of the time — a banner that is always
 * there is a banner nobody reads. Context, not a block: the platform still shows
 * its signals; this reminds the trader the ground is about to move.
 */
export function MacroWindowBanner() {
  const { data } = useQuery({
    queryKey: ["macro", "calendar"],
    queryFn: () => macroApi.calendar(),
    refetchInterval: 60_000,
  });

  const window = data?.window;
  if (!window?.active || !window.event) return null;

  const { minutesUntil } = window;
  const timing =
    typeof minutesUntil === "number"
      ? minutesUntil >= 0
        ? `in ~${minutesUntil} min`
        : `printed ${-minutesUntil} min ago`
      : "now";

  return (
    <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/[0.06] px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <p className="text-xs leading-relaxed">
        <span className="font-medium text-warning">Macro window — {window.event.title} {timing}.</span>{" "}
        High-impact volatility expected. Stops get hit on noise here; consider standing down or sizing down.
      </p>
    </div>
  );
}
