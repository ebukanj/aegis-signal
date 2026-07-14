import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { MarketModule } from "../modules/market/market.module";

/**
 * `MarketModule` is imported for its health indicator only.
 *
 * That is the one direction this dependency may point. Health asks the market
 * module whether the exchanges are reachable; the market module must never ask
 * health for anything. If that ever inverts, the pipeline has acquired a
 * dependency on its own observability, and the thing watching for failure becomes
 * a thing that can cause it.
 */
@Module({
  imports: [TerminusModule, MarketModule],
  controllers: [HealthController],
})
export class HealthModule {}
