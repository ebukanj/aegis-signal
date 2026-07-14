import { Module } from "@nestjs/common";
import { PatternRegistry } from "./application/registry/pattern.registry";
import { PatternService } from "./application/services/pattern.service";
import { SwingEngine } from "./application/services/swing.engine";
import { StructureEngine } from "./application/services/structure.engine";
import { ZoneEngine } from "./application/services/zone.engine";
import { QualityEngine } from "./application/services/quality.engine";
import { PatternCache } from "./application/cache/pattern.cache";

/**
 * The Pattern Engine — the market interpretation layer.
 *
 * Indicators answer *"what is happening mathematically?"* — RSI is 28.3.
 * Patterns answer *"what structure is the market forming?"* — the trend is intact,
 * price just swept the lows and reclaimed, there is an unfilled gap above.
 *
 * The second question cannot be answered with indicator comparisons, and that is
 * the whole reason this module exists. No arrangement of moving averages tells you
 * that price took out the stops under an obvious double bottom and snapped back.
 *
 * ── What it will not do ──
 *
 * It does not generate signals. It does not rank anything. It never says a setup is
 * good. **Patterns are structural evidence**, and every one of them arrives with
 * its working shown: the swings it used, why the detector believes it, and — always
 * — what is wrong with it.
 *
 * ── What it refuses to detect, and why that is a feature ──
 *
 * Head & shoulders. Cup & handle. Rounded tops. Elliott waves. Broadening wedges.
 *
 * Ten traders draw a neckline ten different ways. A "deterministic" detector for
 * those would not be detecting anything — it would pick one arbitrary
 * interpretation, stamp a quality score on it, and present the result as a
 * measurement. That is manufacturing certainty, which is the single thing this
 * platform exists not to do (ADR-024). The contract refuses them and a test guards
 * it.
 */
@Module({
  providers: [
    PatternRegistry,
    SwingEngine,
    StructureEngine,
    ZoneEngine,
    QualityEngine,
    PatternCache,
    PatternService,
  ],
  exports: [PatternService, PatternRegistry, SwingEngine, StructureEngine],
})
export class PatternModule {}
