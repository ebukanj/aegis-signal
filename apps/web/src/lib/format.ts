/**
 * Presentation-only formatting helpers (Intl-based, no dependencies).
 * Business calculations never happen here — values arrive precomputed.
 */

export function formatPrice(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

export function formatPercent(value: number, signed = true): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value);
  return `${formatted}%`;
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const relativeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "always",
  style: "narrow",
});

/** "3m ago" style relative timestamps for feeds and tables. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFormatter.format(Math.trunc(seconds), "second");
  if (abs < 3600) return relativeFormatter.format(Math.trunc(seconds / 60), "minute");
  if (abs < 86400) return relativeFormatter.format(Math.trunc(seconds / 3600), "hour");
  return relativeFormatter.format(Math.trunc(seconds / 86400), "day");
}

/** "6h 20m" / "2d 4h" style compact durations. Negative → "Expired". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * Absolute local timestamp, e.g. "Jul 12, 10:32 AM".
 * Intl formats in the user's own timezone — always pair this with relative
 * times so "4h ago" is never ambiguous.
 */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * Exact publication time, to the second, with the timezone named.
 * e.g. "13 Jul, 14:32:05 GMT+1"
 *
 * A signal is a time-critical instruction: entry prices go stale, and "2 hours
 * ago" does not tell a trader whether they are early or too late. Anywhere a
 * signal is published, show the real clock time.
 */
export function formatSignalTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
