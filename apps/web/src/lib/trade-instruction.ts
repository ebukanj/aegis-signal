import type { MarketType, SignalDirection, Timeframe } from "@/types/domain";
import { formatPrice } from "@/lib/format";

/**
 * Renders the one-sentence trade instruction from fields the Risk Engine
 * decided (marketType, leverage, prices). Pure presentation — no decisions
 * are made here; the backend will produce identical text for notification
 * channels (docs/BACKEND_NOTES.md).
 */

export interface TradeInstructionInput {
  coin: string;
  pair: string;
  exchange: string;
  direction: SignalDirection;
  marketType: MarketType;
  suggestedLeverage: number | null;
  timeframe: Timeframe;
  entryPrice: number;
  stopLoss: number;
  takeProfits?: number[];
  takeProfit?: number;
}

/** Full instruction sentence, e.g. for the signal report and notifications. */
export function buildTradeInstruction(input: TradeInstructionInput): string {
  const targets =
    input.takeProfits && input.takeProfits.length > 0
      ? input.takeProfits.map((tp) => formatPrice(tp)).join(" / ")
      : input.takeProfit !== undefined
        ? formatPrice(input.takeProfit)
        : null;
  const targetText = targets ? `, targets ${targets}` : "";

  if (input.marketType === "SPOT") {
    return `Buy ${input.coin} on ${input.exchange} spot near ${formatPrice(
      input.entryPrice,
    )} (${input.timeframe} setup). Invalidation below ${formatPrice(
      input.stopLoss,
    )}${targetText}.`;
  }

  const leverage = input.suggestedLeverage
    ? `${input.suggestedLeverage}x `
    : "";
  return `Open a ${leverage}${input.direction} on ${input.exchange} ${
    input.pair
  } perpetuals (${input.timeframe} setup). Enter near ${formatPrice(
    input.entryPrice,
  )}, stop ${formatPrice(input.stopLoss)}${targetText}.`;
}

/** Compact execution chip, e.g. "5x · Perpetual · 4h · Bybit". */
export function tradeInstructionChip(input: TradeInstructionInput): string {
  const mode =
    input.marketType === "SPOT"
      ? "Spot"
      : `${input.suggestedLeverage ? `${input.suggestedLeverage}x · ` : ""}Perpetual`;
  return `${mode} · ${input.timeframe} · ${input.exchange}`;
}
