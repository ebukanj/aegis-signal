import { cn } from "@/lib/utils";

interface RadialProgressProps {
  /** 0–100. */
  value: number;
  /** Diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** Semantic tone; defaults to score-based (≥70 success, ≥45 warning, else error). */
  tone?: "success" | "warning" | "error" | "info" | "auto";
  label?: string;
  className?: string;
}

const TONE_CLASS = {
  success: "stroke-success",
  warning: "stroke-warning",
  error: "stroke-destructive",
  info: "stroke-info",
} as const;

/** SVG progress ring for health/score visualization. */
export function RadialProgress({
  value,
  size = 72,
  strokeWidth = 6,
  tone = "auto",
  label,
  className,
}: RadialProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const resolvedTone =
    tone === "auto"
      ? clamped >= 70
        ? "success"
        : clamped >= 45
          ? "warning"
          : "error"
      : tone;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `Score ${clamped} out of 100`}
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset] duration-300",
            TONE_CLASS[resolvedTone],
          )}
        />
      </svg>
      <span className="font-numeric absolute text-sm font-semibold">
        {Math.round(clamped)}
      </span>
    </div>
  );
}
