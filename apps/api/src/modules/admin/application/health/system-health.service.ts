import { Injectable } from "@nestjs/common";
import { memoryUsage } from "node:process";
import { loadavg, totalmem, freemem, cpus } from "node:os";
import { monitorEventLoopDelay } from "node:perf_hooks";

export type HealthLevel = "HEALTHY" | "WARNING" | "CRITICAL";

export interface SystemHealth {
  status: HealthLevel;
  uptimeSeconds: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number; systemUsedPercent: number };
  cpu: { count: number; load1: number; loadPercent: number };
  eventLoop: { meanLagMs: number; p99LagMs: number };
  clock: { timezone: string; isUtc: boolean };
  checks: { name: string; status: HealthLevel; detail: string }[];
}

/**
 * The health of the PROCESS, not the product.
 *
 * The Terminus `/health` endpoint already answers "can I reach the database, redis,
 * the queue, the exchange?". This answers the other half a 24/7 service needs: "is
 * the process itself healthy, right now?" — memory climbing toward the container
 * limit, the event loop stalling under load, the clock drifting.
 *
 * ── Why the event loop and the clock are the two that matter most ──
 *
 * Event-loop lag is the truest single measure of a Node service under strain: when
 * it climbs, every request is already slower, and it climbs before memory or CPU
 * alarms do. And clock skew is the silent killer of a trading platform specifically
 * — this system buckets candles and stamps signals by time, and a server whose
 * clock has drifted will mis-bucket a candle, which is a wrong indicator, which is a
 * wrong signal. A health check that ignored the clock would miss the one drift that
 * corrupts the product's correctness rather than merely its speed.
 */
@Injectable()
export class SystemHealthService {
  private readonly loopMonitor = monitorEventLoopDelay({ resolution: 20 });

  constructor() {
    this.loopMonitor.enable();
  }

  snapshot(): SystemHealth {
    const mem = memoryUsage();
    const rssMb = round(mem.rss / 1e6);
    const heapUsedMb = round(mem.heapUsed / 1e6);
    const heapTotalMb = round(mem.heapTotal / 1e6);
    const systemUsedPercent = round(((totalmem() - freemem()) / totalmem()) * 100);

    const load1 = loadavg()[0];
    const cpuCount = cpus().length || 1;
    const loadPercent = round((load1 / cpuCount) * 100);

    const meanLagMs = round(this.loopMonitor.mean / 1e6);
    const p99LagMs = round(this.loopMonitor.percentile(99) / 1e6);

    /* The clock check that actually matters for THIS platform: is the process on
     * UTC? Everything here buckets candles and stamps signals by time; a non-UTC
     * server silently mis-buckets, and that is a wrong indicator, not just a wrong
     * log line. (Absolute NTP drift is monitored at the OS level, outside the app.) */
    const timezone = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isUtc = timezone === "UTC" || timezone === "Etc/UTC";

    const checks = [
      level("memory", systemUsedPercent, 85, 95, `${systemUsedPercent}% of system memory in use`),
      level("event-loop", meanLagMs, 50, 200, `mean lag ${meanLagMs}ms, p99 ${p99LagMs}ms`),
      level("cpu", loadPercent, 80, 100, `load ${load1.toFixed(2)} across ${cpuCount} cores (${loadPercent}%)`),
      {
        name: "clock",
        status: (isUtc ? "HEALTHY" : "CRITICAL") as HealthLevel,
        detail: isUtc ? "process is on UTC" : `process timezone is ${timezone}, not UTC — candles will mis-bucket`,
      },
    ];

    const status: HealthLevel = checks.some((c) => c.status === "CRITICAL")
      ? "CRITICAL"
      : checks.some((c) => c.status === "WARNING")
        ? "WARNING"
        : "HEALTHY";

    return {
      status,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: { rssMb, heapUsedMb, heapTotalMb, systemUsedPercent },
      cpu: { count: cpuCount, load1: round(load1), loadPercent },
      eventLoop: { meanLagMs, p99LagMs },
      clock: { timezone, isUtc },
      checks,
    };
  }
}

function level(name: string, value: number, warn: number, crit: number, detail: string) {
  const status: HealthLevel = value >= crit ? "CRITICAL" : value >= warn ? "WARNING" : "HEALTHY";
  return { name, status, detail };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
