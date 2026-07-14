import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  candleSchema,
  tickerSchema,
  timeframeSchema,
  type Candle,
  type Ticker,
} from "@aegis/contracts";
import { contract } from "../../common/contract";
import { DomainError } from "../../common/errors/domain-error";
import { MarketService } from "./application/market.service";

/**
 * The market API.
 *
 * Every response goes through `contract()` — validated against the schema before
 * it leaves the process. A candle whose high is below its low never reaches a
 * client, because it never leaves this building (ADR-022).
 *
 * These are read-only. The market module observes; it does not act.
 */
@ApiTags("market")
@Controller({ path: "market", version: "1" })
export class MarketController {
  constructor(private readonly market: MarketService) {}

  /**
   * Candles for a symbol.
   *
   * **Closed candles only.** The forming bar is stripped before it leaves, and
   * the caller cannot ask for it — a strategy that evaluates an unclosed bar is
   * committing look-ahead bias, and the API should not make that mistake
   * available.
   */
  @Get("candles/:symbol")
  @ApiOperation({ summary: "Closed candles for a symbol" })
  async candles(
    @Param("symbol") symbol: string,
    @Query("timeframe") timeframe = "1h",
    @Query("limit") limit = "300",
  ): Promise<{ symbol: string; timeframe: string; candles: Candle[] }> {
    const tf = timeframeSchema.safeParse(timeframe);
    if (!tf.success) {
      throw DomainError.invalid(
        `"${timeframe}" is not a timeframe this platform supports`,
        { supported: ["15m", "1h", "4h", "1d"] },
      );
    }

    const count = Math.min(Math.max(Number(limit) || 300, 1), 1000);

    const candles = await this.market.candles({
      symbol: symbol.toUpperCase(),
      timeframe: tf.data,
      limit: count,
    });

    return {
      symbol: symbol.toUpperCase(),
      timeframe: tf.data,
      candles: contract(z.array(candleSchema), candles),
    };
  }

  @Get("ticker/:symbol")
  @ApiOperation({ summary: "Latest ticker" })
  async ticker(@Param("symbol") symbol: string): Promise<Ticker> {
    const ticker = await this.market.ticker(symbol.toUpperCase());
    return contract(tickerSchema, ticker);
  }

  /**
   * Exchange health and market metrics.
   *
   * Feeds the Administration console. A rising `rejectedRows` count means a feed
   * is degrading — the exchange is still answering, but what it is saying has
   * stopped making sense, and that is the failure that never announces itself.
   */
  @Get("health")
  @ApiOperation({ summary: "Exchange health and market data metrics" })
  health() {
    return this.market.metrics();
  }
}
