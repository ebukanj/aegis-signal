"use client";

import {
  Activity,
  Clock3,
  Gauge,
  Scale,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import { MetricCard } from "@/components/shared/metric-card";
import { REGIME_META, RISK_META, SIGNAL_STATUS_META } from "@/constants/domain";
import type { SignalDetail } from "@/features/signals/types";
import { formatDuration } from "@/lib/format";

/** Hero summary: the six numbers that frame the whole report. */
export function SignalHero({ signal }: { signal: SignalDetail }) {
  const remainingMs = new Date(signal.expiresAt).getTime() - Date.now();

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <MetricCard
        label="Confidence"
        value={`${signal.confidence}`}
        hint="of 100 · breakdown below"
        icon={Gauge}
      />
      <MetricCard
        label="Market Regime"
        value={REGIME_META[signal.regime].label}
        hint={`Detected on ${signal.timeframe}`}
        icon={Activity}
      />
      <MetricCard
        label="Risk Level"
        value={RISK_META[signal.riskLevel].label}
        hint={`Max risk ${signal.maxRiskPercent}% to stop`}
        icon={ShieldAlert}
      />
      <MetricCard
        label="Risk / Reward"
        value={`1 : ${signal.expectedR}`}
        hint="At second target"
        icon={Scale}
      />
      <MetricCard
        label="Status"
        value={SIGNAL_STATUS_META[signal.status].label}
        hint={`${signal.direction === "LONG" ? "Long" : "Short"} · ${signal.exchange}`}
        icon={Waypoints}
      />
      <MetricCard
        label="Time Remaining"
        value={formatDuration(remainingMs)}
        hint="Until signal expiry"
        icon={Clock3}
      />
    </div>
  );
}
