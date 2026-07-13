import { cn } from "@/lib/utils";

/**
 * The Aegis mark.
 *
 * The logo carries the product's two ideas in one shape — *Measure the Market,
 * Protect the Trader*:
 *
 *   THE SHIELD    protection. The Risk Engine's veto, the thing that says no.
 *   THE SIGNAL    a pulse rising through it — the measurement, breaking out.
 *
 * The line breaks *out* of the shield's upper edge on the last stroke, which is
 * the whole point: the platform protects first, then speaks.
 *
 * Drawn rather than borrowed. A generic shield icon says "security product";
 * this says what Aegis actually does.
 */
export function AegisMark({
  className,
  animated = false,
}: {
  className?: string;
  /** Draw the signal line in on mount. Used on the landing page only. */
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-8", className)}
      role="img"
      aria-label="Aegis Signal"
    >
      <defs>
        <linearGradient id="aegis-shield" x1="16" y1="2" x2="16" y2="30">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* The shield — protection */}
      <path
        d="M16 2.6 27 6.4v8.9c0 6.6-4.4 12.3-11 14.1C9.4 27.6 5 21.9 5 15.3V6.4L16 2.6Z"
        fill="url(#aegis-shield)"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity="0.9"
      />

      {/* The signal — measurement, rising, breaking the upper edge */}
      <path
        d="M9 19.4l3.6-3.7 2.9 2.9 5.6-8.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          animated &&
            "[stroke-dasharray:26] [stroke-dashoffset:26] motion-safe:animate-[aegis-draw_1.1s_.25s_ease-out_forwards] motion-reduce:[stroke-dashoffset:0]",
        )}
      />

      {/* Where the signal lands — the trade */}
      <circle cx="21.1" cy="10.4" r="2.1" fill="currentColor" />
    </svg>
  );
}
