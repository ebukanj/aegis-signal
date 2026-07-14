import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { MarketService } from "./application/market.service";
import { ExchangeHealthWorker } from "./application/exchange-health.worker";
import { MarketController } from "./market.controller";
import { SymbolRegistry } from "./domain/symbol-registry";
import { MarketNormalizer } from "./infrastructure/normalizers/market.normalizer";
import { MarketCache } from "./infrastructure/cache/market.cache";
import { MarketGateway } from "./infrastructure/market.gateway";
import { ExchangeHealthIndicator } from "./exchange.health";

/**
 * The Market Data & Exchange Layer.
 *
 * **The only part of this platform that talks to an exchange.** Nothing above it
 * has heard of CCXT, of `fstream.binance.com`, or of the fact that OKX spells a
 * perpetual `BTC-USDT-SWAP`. That wall is the point: exchanges are the least
 * stable dependency we have, and behind an interface their instability is an
 * adapter problem rather than a strategy bug (Philosophy 19).
 *
 * It owns: exchange communication · rate limiting · retries · reconnection ·
 * normalization · caching · event publishing.
 *
 * It owns none of: indicators · patterns · strategies · risk · confidence ·
 * signals. Those are downstream, and they all assume the data arriving here is
 * accurate, timely and normalized. If it is not, every one of them is wrong — and
 * wrong in a way none of them can detect, because a bad candle looks exactly like
 * a good one.
 */
@Module({
  // For `HealthIndicatorService` only — so the market module can report exchange
  // connectivity to /health without health having to reach inside it.
  imports: [TerminusModule],
  controllers: [MarketController],
  providers: [
    SymbolRegistry,
    MarketNormalizer,
    MarketCache,
    MarketService,
    MarketGateway,
    ExchangeHealthWorker,
    ExchangeHealthIndicator,
  ],
  exports: [MarketService, SymbolRegistry, ExchangeHealthIndicator],
})
export class MarketModule {}
