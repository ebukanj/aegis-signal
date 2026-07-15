import { Module } from "@nestjs/common";
import { IndicatorModule } from "../indicators/indicator.module";
import { PatternModule } from "../patterns/pattern.module";
import { RegimeService } from "./application/services/regime.service";
import { RegimeClassifier } from "./application/classifiers/regime.classifier";
import { AlignmentService } from "./application/services/alignment.service";
import { CompatibilityService } from "./application/services/compatibility.service";
import { RegimeCache } from "./application/cache/regime.cache";

/**
 * The Market Regime Engine — the decision context for the whole platform.
 *
 *   Indicators describe the market.
 *   Patterns  describe its structure.
 *   **This says what environment the market is in.**
 *
 * No strategy should ever be evaluated without it. A strategy that prints money in a
 * trend gets shredded in a range, and the difference is the environment's fault
 * rather than the strategy's — so the platform is entitled to know which one it is
 * standing in before it decides anything.
 *
 * ── Two axes, because one label was never enough ──
 *
 * DIRECTION (trending bull / bear / range / transition / risk-off) and VOLATILITY
 * (compressed / normal / expanded) are orthogonal, and both are always true at once.
 * A market ripping upward on 3× normal range is a bull trend AND it is high
 * volatility; forcing a single winner would mean inventing a tiebreak and presenting
 * it as a measurement.
 *
 * ── `agreement` is not a probability, and never will be ──
 *
 * There is no ground truth for a regime. Nobody can say what regime the market
 * "really" was in on 14 March — no oracle, no settlement, no resolved outcome. So a
 * regime "probability" is not merely uncalibrated; it is **unfalsifiable by
 * construction**. It could never be checked, so it could never be wrong, so it means
 * nothing.
 *
 * `agreement` says how much of the weighted evidence agrees, ships every ballot
 * including the dissenting ones, and is stamped UNCALIBRATED forever.
 *
 * ── It exposes compatibility. It never executes anything. ──
 */
@Module({
  imports: [IndicatorModule, PatternModule],
  providers: [
    RegimeClassifier,
    AlignmentService,
    CompatibilityService,
    RegimeCache,
    RegimeService,
  ],
  exports: [RegimeService, CompatibilityService, AlignmentService, RegimeClassifier],
})
export class RegimeModule {}
