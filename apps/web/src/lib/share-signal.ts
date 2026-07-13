import { formatPrice, formatSignalTime } from "@/lib/format";
import type { Opportunity } from "@/features/scanner/types";

/**
 * A signal, as shareable plain text.
 *
 * The constraint that shapes this: it must land *legibly* in a plain textarea.
 * WhatsApp, Telegram and Notepad have no markdown, no tables, no monospace —
 * so alignment is done with spaces and the structure carries in the line
 * breaks alone. No code fences, no pipes, nothing that renders as literal
 * punctuation soup on the other end.
 *
 * It carries the same four things the card does (AGENTS.md §1): what to trade,
 * how to take it, why, and what proves it wrong — plus the timestamp, because a
 * pasted signal outlives the screen it came from and a stale entry is
 * dangerous.
 */
export function formatSignalForSharing(signal: Opportunity): string {
  const side = signal.direction === "LONG" ? "LONG" : "SHORT";
  const market =
    signal.marketType === "SPOT"
      ? "Spot"
      : `Perpetual${signal.suggestedLeverage ? ` · up to ${signal.suggestedLeverage}x` : ""}`;

  const risk = Math.abs(signal.entryPrice - signal.stopLoss);
  const riskPercent = ((risk / signal.entryPrice) * 100).toFixed(2);

  const lines = [
    `${side} — ${signal.pair}`,
    signal.isPrime ? `PRIME SIGNAL · Confidence ${signal.confidence}%` : `Confidence ${signal.confidence}%`,
    ``,
    `Exchange   ${signal.exchange}`,
    `Market     ${market}`,
    `Timeframe  ${signal.timeframe}`,
    ``,
    `Entry      ${formatPrice(signal.entryPrice)}`,
    `Stop loss  ${formatPrice(signal.stopLoss)}   (-${riskPercent}%)`,
    `Target     ${formatPrice(signal.takeProfit)}   (${signal.rewardRisk}R)`,
    ``,
    `Why: ${
      signal.strategies.length > 1
        ? `${signal.strategies.length} strategies agreed — ${signal.strategies.join(", ")}`
        : signal.strategies[0]
    }`,
    `Invalidation: a close beyond ${formatPrice(signal.stopLoss)} kills the trade. Exit — do not average down.`,
    ``,
    `Published  ${formatSignalTime(signal.generatedAt)}`,
    `Aegis Signal — not financial advice. Size by your own risk.`,
  ];

  return lines.join("\n");
}
