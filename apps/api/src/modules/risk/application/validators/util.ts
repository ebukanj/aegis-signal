import type { Maybe } from "../../../indicators/application/math/rolling";

/** The last defined value of a series, or null. */
export function last(series: readonly Maybe[] | undefined): number | null {
  if (!series) return null;

  for (let i = series.length - 1; i >= 0; i--) {
    const value = series[i];
    if (value !== null && value !== undefined) return value;
  }

  return null;
}

/** The value `back` bars ago. Null if it is not defined there. */
export function at(
  series: readonly Maybe[] | undefined,
  back: number,
): number | null {
  if (!series) return null;

  const index = series.length - 1 - back;
  if (index < 0) return null;

  return series[index] ?? null;
}

/** Prices at a sensible precision for the instrument's own scale. */
export function fmt(value: number): string {
  if (Math.abs(value) >= 1_000) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);

  return value.toPrecision(4);
}

export function pct(value: number, digits = 3): string {
  return `${value.toFixed(digits)}%`;
}
