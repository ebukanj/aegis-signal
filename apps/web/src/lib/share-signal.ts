import { formatPrice, formatSignalTime } from "@/lib/format";
import type { Opportunity } from "@/features/scanner/types";

/**
 * A signal, as shareable plain text.
 *
 * The constraint that shapes this: it must land *legibly* in a plain textarea.
 * WhatsApp, Telegram and Notepad have no markdown, no tables, no monospace — so
 * the structure carries in line breaks and emoji alone. No code fences, no
 * pipes, nothing that renders as literal punctuation soup on the other end.
 *
 * Emoji are load-bearing here, not decoration: a trader glancing at a phone
 * needs to find the stop in under a second. 🛑 finds it faster than the word
 * "stop" does. Each one maps to a meaning and is used for nothing else:
 *
 *   🟢 long   🔴 short   ⭐ prime   🎯 target   🛑 stop   ⚠️ invalidation
 *
 * It carries the same four things the card does (AGENTS.md §1): what to trade,
 * how to take it, why, and what proves it wrong — plus the timestamp, because a
 * pasted signal outlives the screen it came from and a stale entry is dangerous.
 */
export function formatSignalForSharing(signal: Opportunity): string {
  const isLong = signal.direction === "LONG";
  const side = isLong ? "🟢 LONG" : "🔴 SHORT";

  const market =
    signal.marketType === "SPOT"
      ? "Spot"
      : `Perpetual${signal.suggestedLeverage ? ` · up to ${signal.suggestedLeverage}x` : ""}`;

  const stopDistance = Math.abs(signal.entryPrice - signal.stopLoss);
  const stopPercent = ((stopDistance / signal.entryPrice) * 100).toFixed(2);

  const why =
    signal.strategies.length > 1
      ? `${signal.strategies.length} strategies agreed — ${signal.strategies.join(", ")}`
      : signal.strategies[0];

  const lines = [
    `${side}  ${signal.pair}`,
    signal.isPrime
      ? `⭐ PRIME SIGNAL · Confidence ${signal.confidence}%`
      : `Confidence ${signal.confidence}%`,
    ``,
    `📊 ${signal.exchange} · ${market} · ${signal.timeframe}`,
    ``,
    `📍 Entry   ${formatPrice(signal.entryPrice)}`,
    `🛑 Stop    ${formatPrice(signal.stopLoss)}  (-${stopPercent}%)`,
    `🎯 Target  ${formatPrice(signal.takeProfit)}  (${signal.rewardRisk}R)`,
    ``,
    `💡 Why: ${why}`,
    ``,
    `⚠️ Invalidation`,
    `A close beyond ${formatPrice(signal.stopLoss)} kills this trade.`,
    `Exit — do not average down.`,
    ``,
    `🕐 ${formatSignalTime(signal.generatedAt)}`,
    `Aegis Signal · not financial advice · size by your own risk`,
  ];

  return lines.join("\n");
}
