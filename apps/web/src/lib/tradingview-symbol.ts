import type { MarketType } from "@/types/domain";

/**
 * Build the TradingView symbol for a signal.
 *
 * Two things were broken and both produced "This symbol doesn't exist":
 *
 * 1. PERPETUALS NEED `.P`. TradingView distinguishes the spot book from the
 *    perpetual: `BINANCE:SOLUSDT` is spot, `BINANCE:SOLUSDT.P` is the perp. We
 *    were sending the spot symbol for perpetual signals, so any coin whose spot
 *    pair does not exist on that venue rendered an empty chart — while the
 *    signal itself was perfectly valid.
 *
 * 2. WE INVENTED LISTINGS. The mock assigned a random exchange to every coin, so
 *    it happily produced things like KuCoin TON that do not exist. Fixed at the
 *    source (mock-opportunities), but the fallback below keeps the chart honest
 *    if it ever happens again: an unknown venue falls back to Binance rather
 *    than rendering nothing.
 */

const TV_EXCHANGE_PREFIX: Record<string, string> = {
  Binance: "BINANCE",
  Bybit: "BYBIT",
  OKX: "OKX",
  Bitget: "BITGET",
  KuCoin: "KUCOIN",
};

export function buildTradingViewSymbol(input: {
  coin: string;
  exchange: string;
  marketType: MarketType;
}): string {
  const prefix = TV_EXCHANGE_PREFIX[input.exchange] ?? "BINANCE";
  const perp = input.marketType === "PERPETUAL" ? ".P" : "";
  return `${prefix}:${input.coin}USDT${perp}`;
}
