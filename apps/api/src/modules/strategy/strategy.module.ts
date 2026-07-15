import { Module } from "@nestjs/common";
import { IndicatorModule } from "../indicators/indicator.module";
import { PatternModule } from "../patterns/pattern.module";
import { RegimeModule } from "../regime/regime.module";
import { StrategyRepository } from "./infrastructure/strategy.repository";
import { DependencyResolver } from "./application/resolver/dependency.resolver";
import { ConditionExecutor } from "./application/executor/condition.executor";
import { RegimeGate } from "./application/executor/regime.gate";
import { TradePlanner } from "./application/executor/trade.planner";
import { StrategyEvaluator } from "./application/executor/strategy.evaluator";
import { StrategyService } from "./application/services/strategy.service";

/**
 * The Strategy Evaluator — the document interpreter.
 *
 * Every strategy this platform will ever run — the six built-ins, and every strategy a
 * user invents tomorrow — is a `StrategyDefinition` document, and there is exactly ONE
 * thing that reads it. Not six plugins. Not a `switch`. One evaluator.
 *
 * **A new strategy is a new document, not a new code path** (ADR-023). That is the
 * load-bearing decision of the platform, and this module is where it is either honoured
 * or quietly broken. The day a `switch (strategy.id)` appears in here, user strategies
 * become second-class citizens and the promise is over.
 *
 * ── What it produces, and what it deliberately does not ──
 *
 * A **candidate**: trading intent, and the weakest opinion the platform will ever hold.
 * It carries no confidence, has no approval, and has not been risk-validated. The Risk
 * Engine can kill every one of them — and that is not a failure of this module. The
 * veto IS the product (AGENTS.md §1).
 *
 * A **rejection** is a first-class result, never an absence. Returning nothing when a
 * strategy does not fire would throw away the most useful thing this engine knows:
 * *which* condition said no. Silence is a feature; silence with no explanation is a bug.
 */
@Module({
  imports: [IndicatorModule, PatternModule, RegimeModule],
  providers: [
    StrategyRepository,
    DependencyResolver,
    ConditionExecutor,
    RegimeGate,
    TradePlanner,
    StrategyEvaluator,
    StrategyService,
  ],
  exports: [StrategyService, StrategyRepository, StrategyEvaluator, DependencyResolver],
})
export class StrategyModule {}
