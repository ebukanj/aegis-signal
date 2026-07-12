import { toast } from "sonner";
import type { Opportunity } from "@/features/scanner/types";
import { formatPrice } from "@/lib/format";
import { buildTradeInstruction } from "@/lib/trade-instruction";

/** Plain-text representation of an opportunity for clipboard/share. */
export function opportunityToText(opp: Opportunity): string {
  return [
    `${opp.isPrime ? "★ PRIME · " : ""}${opp.direction} ${opp.pair} · ${opp.exchange} (${opp.timeframe})`,
    `Strategies: ${opp.strategies.join(" + ")} · Confidence: ${opp.confidence}/100`,
    buildTradeInstruction(opp),
    `Entry: ${formatPrice(opp.entryPrice)}`,
    `Stop Loss: ${formatPrice(opp.stopLoss)}`,
    `Take Profit: ${formatPrice(opp.takeProfit)} (R:R ${opp.rewardRisk})`,
    `— Aegis Signal`,
  ].join("\n");
}

export async function copyOpportunity(opp: Opportunity): Promise<void> {
  try {
    await navigator.clipboard.writeText(opportunityToText(opp));
    toast.success(`${opp.pair} signal copied to clipboard.`);
  } catch {
    toast.error("Clipboard unavailable in this browser.");
  }
}
