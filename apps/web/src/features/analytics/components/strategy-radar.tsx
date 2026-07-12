"use client";

import { useState, useMemo } from "react";
import { ChartCard } from "@/components/shared/chart-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { STRATEGY_RADAR_AXES, type StrategyPerformanceRow } from "../types";
import { cn } from "@/lib/utils";

const SIZE = 280;
const CENTER = SIZE / 2;
const RADIUS = 110;
const RINGS = [25, 50, 75, 100];
const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
];

function polarToCartesian(angle: number, radius: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
}

interface StrategyRadarProps {
  strategies: StrategyPerformanceRow[];
  loading?: boolean;
  className?: string;
}

/**
 * Custom SVG radar chart comparing up to 4 strategies across 6 axes.
 * Users select strategies from dropdowns.
 */
export function StrategyRadar({
  strategies,
  loading = false,
  className,
}: StrategyRadarProps) {
  const top4 = strategies.slice(0, 4);
  const [selected, setSelected] = useState<string[]>(() =>
    top4.map((s) => s.slug),
  );

  const selectedStrategies = useMemo(
    () =>
      selected
        .map((slug) => strategies.find((s) => s.slug === slug))
        .filter(Boolean) as StrategyPerformanceRow[],
    [selected, strategies],
  );

  const axes = STRATEGY_RADAR_AXES;
  const angleStep = 360 / axes.length;

  if (loading) {
    return (
      <ChartCard title="Strategy Radar" className={className}>
        <Skeleton className="mx-auto size-64 rounded-full" />
      </ChartCard>
    );
  }

  const handleSelect = (index: number, slug: string) => {
    setSelected((prev) => {
      const next = [...prev];
      next[index] = slug;
      return next;
    });
  };

  return (
    <ChartCard
      title="Strategy Radar"
      description="Normalized comparison across 6 performance dimensions"
      className={className}
    >
      {/* Strategy selectors */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: COLORS[i] }}
              aria-hidden
            />
            <Select
              value={selected[i] ?? ""}
              onValueChange={(v) => handleSelect(i, v)}
            >
              <SelectTrigger className="h-7 w-[130px] text-xs" aria-label={`Strategy ${i + 1}`}>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (
                  <SelectItem key={s.slug} value={s.slug}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {/* SVG Radar */}
      <div className="flex justify-center">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label="Strategy radar chart"
          className="overflow-visible"
        >
          {/* Grid rings */}
          {RINGS.map((ring) => {
            const r = (ring / 100) * RADIUS;
            const points = axes
              .map((_, i) => {
                const p = polarToCartesian(i * angleStep, r);
                return `${p.x},${p.y}`;
              })
              .join(" ");
            return (
              <polygon
                key={ring}
                points={points}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeWidth={1}
              />
            );
          })}

          {/* Axis lines + labels */}
          {axes.map((axis, i) => {
            const angle = i * angleStep;
            const end = polarToCartesian(angle, RADIUS);
            const labelPos = polarToCartesian(angle, RADIUS + 18);
            return (
              <g key={axis}>
                <line
                  x1={CENTER}
                  y1={CENTER}
                  x2={end.x}
                  y2={end.y}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                  strokeWidth={1}
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-muted-foreground text-[9px]"
                >
                  {axis}
                </text>
              </g>
            );
          })}

          {/* Data polygons */}
          {selectedStrategies.map((strat, si) => {
            const points = axes
              .map((axis, i) => {
                const val = strat.radar[axis] ?? 0;
                const r = (val / 100) * RADIUS;
                const p = polarToCartesian(i * angleStep, r);
                return `${p.x},${p.y}`;
              })
              .join(" ");
            return (
              <polygon
                key={strat.slug}
                points={points}
                fill={COLORS[si]}
                fillOpacity={0.12}
                stroke={COLORS[si]}
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            );
          })}

          {/* Data points */}
          {selectedStrategies.map((strat, si) =>
            axes.map((axis, i) => {
              const val = strat.radar[axis] ?? 0;
              const r = (val / 100) * RADIUS;
              const p = polarToCartesian(i * angleStep, r);
              return (
                <circle
                  key={`${strat.slug}-${axis}`}
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill={COLORS[si]}
                >
                  <title>{`${strat.name} — ${axis}: ${val}`}</title>
                </circle>
              );
            }),
          )}
        </svg>
      </div>
    </ChartCard>
  );
}
