import { toast } from "sonner";
import type { SignalDetail } from "@/features/signals/types";
import { formatPrice } from "@/lib/format";
import { buildTradeInstruction } from "@/lib/trade-instruction";

/** Plain-text representation of a signal for clipboard/share. */
export function signalToText(signal: SignalDetail): string {
  return [
    `${signal.isPrime ? "★ PRIME · " : ""}${signal.direction} ${signal.pair} · ${signal.exchange} (${signal.timeframe})`,
    `Strategies: ${signal.strategies.join(" + ")} · Confidence: ${signal.confidence}/100`,
    buildTradeInstruction(signal),
    `Entry: ${formatPrice(signal.entryPrice)}`,
    `Stop Loss: ${formatPrice(signal.stopLoss)}`,
    ...signal.takeProfits.map(
      (tp, i) => `Take Profit ${i + 1}: ${formatPrice(tp)}`,
    ),
    `Expected R: ${signal.expectedR}`,
    `— Aegis Signal`,
  ].join("\n");
}

export async function copySignal(signal: SignalDetail): Promise<void> {
  try {
    await navigator.clipboard.writeText(signalToText(signal));
    toast.success(`${signal.pair} signal copied to clipboard.`);
  } catch {
    toast.error("Clipboard unavailable in this browser.");
  }
}
