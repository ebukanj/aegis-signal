"use client";

import type { CalibrationPoint } from "@aegis/contracts";
import { Card } from "@/components/ui/card";

/**
 * The reliability curve — the most important chart in the platform.
 *
 * It plots what we *said* against what actually *happened*. The diagonal is
 * perfect honesty: signals we scored 90 win 90% of the time.
 *
 *   BELOW the line  → we are OVERCONFIDENT at that score. We are talking traders
 *                     into trades with a number we have not earned. This is the
 *                     failure mode that matters, and the only way to see it is
 *                     to draw it.
 *   ABOVE the line  → we are underselling ourselves. Less dangerous, still wrong.
 *
 * No other screen can catch a lying scorer. A win rate alone cannot: a platform
 * can be right 60% of the time overall while being catastrophically wrong every
 * time it claims 90. This chart is the only thing that separates a calibrated
 * probability from a decorative one — which is precisely the difference this
 * whole platform is built on (ADR-024).
 */
export function ReliabilityChart({
  points,
  historical,
}: {
  points: CalibrationPoint[];
  historical: CalibrationPoint[];
}) {
  const hasData = points.length > 0 || historical.length > 0;

  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">
          Are we honest?
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          What we predicted, against what actually happened. The diagonal is
          perfect calibration — when we say 90, we should be right 90% of the
          time.
        </p>
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 300 300"
          className="w-full"
          role="img"
          aria-label={
            hasData
              ? "Reliability curve: predicted confidence against actual win rate"
              : "Reliability curve — no data yet"
          }
        >
          {/* grid */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line
                x1={30 + v * 2.5}
                y1={10}
                x2={30 + v * 2.5}
                y2={260}
                className="stroke-border"
                strokeWidth={0.5}
              />
              <line
                x1={30}
                y1={260 - v * 2.5}
                x2={280}
                y2={260 - v * 2.5}
                className="stroke-border"
                strokeWidth={0.5}
              />
              <text
                x={30 + v * 2.5}
                y={275}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {v}
              </text>
              <text
                x={22}
                y={264 - v * 2.5}
                textAnchor="end"
                className="fill-muted-foreground text-[9px]"
              >
                {v}
              </text>
            </g>
          ))}

          {/* The line of perfect honesty */}
          <line
            x1={30}
            y1={260}
            x2={280}
            y2={10}
            className="stroke-muted-foreground"
            strokeWidth={1}
            strokeDasharray="4 4"
          />

          {/* Historical prior — real, but optimistic. Shown apart, never merged. */}
          {historical.length > 1 && (
            <polyline
              points={historical
                .map((p) => `${30 + p.predicted * 2.5},${260 - p.actual * 2.5}`)
                .join(" ")}
              fill="none"
              className="stroke-muted-foreground"
              strokeWidth={1.5}
              strokeDasharray="2 3"
            />
          )}

          {/* Live results — the truth */}
          {points.length > 1 && (
            <polyline
              points={points
                .map((p) => `${30 + p.predicted * 2.5},${260 - p.actual * 2.5}`)
                .join(" ")}
              fill="none"
              className="stroke-primary"
              strokeWidth={2}
            />
          )}
          {points.map((p) => (
            <circle
              key={p.bucket}
              cx={30 + p.predicted * 2.5}
              cy={260 - p.actual * 2.5}
              r={3}
              className="fill-primary"
            />
          ))}

          <text
            x={155}
            y={292}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
          >
            What we predicted
          </text>
        </svg>

        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-xs rounded-lg border border-dashed bg-card/95 px-4 py-3 text-center">
              <p className="text-sm font-medium">Nothing to plot yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This curve needs settled signals. Until it has them, no
                confidence number on this platform is a win rate — and every one
                of them says so.
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="border-t pt-3 text-xs text-muted-foreground">
        A point <span className="font-medium text-destructive">below</span> the
        line means we are overconfident at that score — talking you into trades
        with a number we have not earned. That is the failure this chart exists
        to catch, and no other screen can.
      </p>
    </Card>
  );
}
