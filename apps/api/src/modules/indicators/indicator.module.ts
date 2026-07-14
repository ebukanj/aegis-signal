import { Module } from "@nestjs/common";
import { IndicatorRegistry } from "./application/registry/indicator.registry";
import { IndicatorService } from "./application/services/indicator.service";
import { IndicatorValidationService } from "./application/services/indicator-validation.service";
import { TimeframeResolver } from "./application/services/timeframe.resolver";
import { OperatorEvaluator } from "./application/services/operator.evaluator";
import { DivergenceEngine } from "./application/services/divergence.engine";
import { IndicatorCache } from "./application/cache/indicator.cache";

/**
 * The Indicator Engine — the mathematical core.
 *
 * It turns candles into numbers. That is all it does, and the discipline of that
 * boundary is what makes everything above it auditable:
 *
 *   · It does not know what a strategy is.
 *   · It does not know what a signal is.
 *   · It never says a market is overbought, or a trend is strong, or a setup is
 *     good. It says "RSI(14) is 28.3", and something else decides what that means.
 *
 * **Indicators provide evidence. They never make decisions.**
 *
 * Every module downstream — Pattern, Strategy, Risk, Confidence, Signal — is
 * built on the numbers produced here, and none of them can detect an error in
 * them. A wrong ATR is a wrong stop is a wrong position size is a real loss, and
 * nothing between here and the trader would flag it. That is why this module is
 * pure functions with golden-master tests rather than something cleverer.
 *
 * Exports the service (compute an indicator), the registry (what CAN be computed —
 * the strategy editor needs this), the resolver (multi-timeframe), the operator
 * evaluator and the divergence engine. The calculators themselves are NOT
 * exported: nothing outside this module should ever hold one, or the "strategies
 * never instantiate indicators" rule becomes a convention rather than a fact.
 */
@Module({
  providers: [
    IndicatorRegistry,
    IndicatorValidationService,
    IndicatorCache,
    IndicatorService,
    TimeframeResolver,
    OperatorEvaluator,
    DivergenceEngine,
  ],
  exports: [
    IndicatorService,
    IndicatorRegistry,
    TimeframeResolver,
    OperatorEvaluator,
    DivergenceEngine,
  ],
})
export class IndicatorModule {}
