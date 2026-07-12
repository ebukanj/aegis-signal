"use client";

import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { ChartCard } from "@/components/shared/chart-card";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { SignalQuality, ConfidenceBucket } from "../types";
import { cn } from "@/lib/utils";

interface SignalQualityCardProps {
  quality: SignalQuality;
  loading?: boolean;
  className?: string;
}

function BucketCard({ bucket }: { bucket: ConfidenceBucket }) {
  return (
    <Card className="gap-2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{bucket.label}</span>
        <span className="font-numeric text-[11px] text-muted-foreground">
          {bucket.range}
        </span>
      </div>
      <div className="font-numeric text-xl font-semibold">
        {bucket.successRate.toFixed(1)}%
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{bucket.signals} signals</span>
        <span>{bucket.triggered} triggered</span>
        <span>{bucket.wins} wins</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-numeric text-muted-foreground">
          Avg: {bucket.avgR >= 0 ? "+" : ""}{bucket.avgR.toFixed(3)}R
        </span>
        {bucket.calibrated ? (
          <StatusBadge status="success" dot={false} className="text-[10px]">
            Calibrated
          </StatusBadge>
        ) : (
          <StatusBadge status="warning" dot={false} className="text-[10px]">
            Miscalibrated
          </StatusBadge>
        )}
      </div>
    </Card>
  );
}

/**
 * Signal quality analysis: confidence bucket breakdown, false positive rate,
 * expiry rate, and quality trend.
 */
export function SignalQualityCard({
  quality,
  loading = false,
  className,
}: SignalQualityCardProps) {
  if (loading) {
    return (
      <ChartCard title="Signal Quality" className={className}>
        <Skeleton className="h-48 w-full" />
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Signal Quality"
      description="Confidence bucket performance and calibration"
      className={className}
    >
      {/* Confidence buckets */}
      <div className="grid gap-3 sm:grid-cols-3">
        {quality.buckets.map((bucket) => (
          <BucketCard key={bucket.key} bucket={bucket} />
        ))}
      </div>

      {/* Quality metrics */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QualityStat
          icon={XCircle}
          label="False Positives"
          value={quality.falsePositives.toString()}
          sub={`${quality.falsePositiveRate.toFixed(1)}% rate`}
          tone="error"
        />
        <QualityStat
          icon={AlertTriangle}
          label="False Negatives"
          value={quality.falseNegatives === null ? "N/A" : quality.falseNegatives.toString()}
          sub="Not measured"
          tone="neutral"
        />
        <QualityStat
          icon={Clock}
          label="Expired Signals"
          value={quality.expiredSignals.toString()}
          sub={`${quality.expiryRate.toFixed(1)}% expiry rate`}
          tone="warning"
        />
        <QualityStat
          icon={CheckCircle2}
          label="Avg Time to Target"
          value={`${quality.avgHoursToTarget.toFixed(1)}h`}
          sub={quality.confidenceIsCalibrated ? "Confidence calibrated" : "Needs calibration"}
          tone={quality.confidenceIsCalibrated ? "success" : "warning"}
        />
      </div>

      {/* Quality trend */}
      {quality.successTrend.length > 0 && (
        <div className="mt-4">
          <span className="label-caps mb-2 block">Monthly Win Rate Trend</span>
          <div className="flex items-end gap-1">
            {quality.successTrend.map((point) => {
              const height = Math.max(4, (point.value / 100) * 80);
              return (
                <div
                  key={point.label}
                  className="group relative flex-1"
                  title={`${point.label}: ${point.value.toFixed(1)}%`}
                >
                  <div
                    className={cn(
                      "w-full rounded-t-sm transition-colors",
                      point.value >= 50 ? "bg-success/50" : "bg-destructive/50",
                      "group-hover:opacity-80",
                    )}
                    style={{ height: `${height}px` }}
                  />
                  <span className="font-numeric mt-1 block text-center text-[8px] text-muted-foreground">
                    {point.label.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function QualityStat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof XCircle;
  label: string;
  value: string;
  sub: string;
  tone: "success" | "warning" | "error" | "neutral";
}) {
  const toneClasses = {
    success: "text-success",
    warning: "text-warning",
    error: "text-destructive",
    neutral: "text-muted-foreground",
  };

  return (
    <div className="space-y-1 rounded-lg border p-3">
      <div className="flex items-center gap-1.5">
        <Icon className={cn("size-3.5", toneClasses[tone])} aria-hidden />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="font-numeric text-lg font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
