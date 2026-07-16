import { Injectable } from "@nestjs/common";
import { memoryUsage } from "node:process";

type Labels = Record<string, string>;
interface Sample {
  name: string;
  help: string;
  type: "gauge" | "counter";
  labels: Labels;
  value: number;
}

/**
 * Prometheus exposition, hand-rolled — deliberately no new dependency.
 *
 * `prom-client` is the usual answer, but it pulls a runtime dependency and a global
 * default registry into a service whose entire job is to emit ~20 numbers in a
 * well-specified text format. The format is stable and simple, so we produce it
 * directly. The cost is that we own the escaping; the benefit is one less dependency
 * in a security-sensitive process and a metrics surface we can read end to end.
 *
 * ── Pull, not push ──
 *
 * Metrics are GATHERED on scrape, not accumulated in the background. Every value here
 * is read live from a source of truth the platform already maintains — process
 * memory from the runtime, business gauges from each module's `metrics()` — so the
 * scrape can never drift from reality the way a separately-incremented counter can.
 * The one thing we keep is a small set of monotonic HTTP counters, because those have
 * no other home.
 */
@Injectable()
export class PrometheusService {
  /* The only genuinely accumulated state: HTTP traffic counters. Everything else is
   * gathered live at scrape time. */
  private httpRequests = new Map<string, number>();
  private httpErrors = 0;

  recordHttp(method: string, statusCode: number): void {
    const cls = `${Math.floor(statusCode / 100)}xx`;
    const key = `${method}:${cls}`;
    this.httpRequests.set(key, (this.httpRequests.get(key) ?? 0) + 1);
    if (statusCode >= 500) this.httpErrors += 1;
  }

  /**
   * Render the full exposition. `appGauges` is a flat bag of already-computed
   * business numbers (from the admin aggregator) so this service never has to know
   * what a signal or a notification is.
   */
  render(appGauges: Record<string, number>): string {
    const samples: Sample[] = [];

    const mem = memoryUsage();
    samples.push(gauge("process_resident_memory_bytes", "Resident memory size in bytes", mem.rss));
    samples.push(gauge("nodejs_heap_used_bytes", "Node.js heap used in bytes", mem.heapUsed));
    samples.push(gauge("nodejs_heap_total_bytes", "Node.js heap total in bytes", mem.heapTotal));
    samples.push(gauge("process_uptime_seconds", "Process uptime in seconds", process.uptime()));

    for (const [key, cls] of splitKeys(this.httpRequests)) {
      samples.push({
        name: "http_requests_total",
        help: "Total HTTP requests handled, by method and status class",
        type: "counter",
        labels: { method: key.method, status: cls },
        value: this.httpRequests.get(key.raw) ?? 0,
      });
    }
    samples.push(counter("http_errors_total", "Total HTTP responses with a 5xx status", {}, this.httpErrors));

    for (const [name, value] of Object.entries(appGauges)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        samples.push(gauge(`aegis_${name}`, `Aegis Signal business gauge: ${name}`, value));
      }
    }

    return format(samples);
  }
}

function gauge(name: string, help: string, value: number): Sample {
  return { name, help, type: "gauge", labels: {}, value };
}
function counter(name: string, help: string, labels: Labels, value: number): Sample {
  return { name, help, type: "counter", labels, value };
}

function splitKeys(map: Map<string, number>): [{ raw: string; method: string }, string][] {
  return [...map.keys()].map((raw) => {
    const [method, cls] = raw.split(":");
    return [{ raw, method }, cls];
  });
}

/** Group samples by metric name so each `# HELP`/`# TYPE` header is emitted once. */
function format(samples: Sample[]): string {
  const byName = new Map<string, Sample[]>();
  for (const s of samples) {
    const list = byName.get(s.name) ?? [];
    list.push(s);
    byName.set(s.name, list);
  }

  const lines: string[] = [];
  for (const [name, group] of byName) {
    lines.push(`# HELP ${name} ${group[0].help}`);
    lines.push(`# TYPE ${name} ${group[0].type}`);
    for (const s of group) lines.push(`${name}${renderLabels(s.labels)} ${s.value}`);
  }
  return `${lines.join("\n")}\n`;
}

function renderLabels(labels: Labels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  const inner = entries.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(",");
  return `{${inner}}`;
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}
