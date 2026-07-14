import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { patternSchema, type Pattern } from "@aegis/contracts";
import type { IPatternDetector } from "../../domain/pattern.interface";

import {
  breakOfStructureDetector,
  changeOfCharacterDetector,
  equalHighsDetector,
  equalLowsDetector,
  higherHighHigherLowDetector,
  lowerHighLowerLowDetector,
  rangeDetector,
} from "../detectors/structure.detectors";

import {
  fairValueGapDetector,
  liquiditySweepDetector,
  orderBlockDetector,
} from "../detectors/liquidity.detectors";

import {
  ascendingChannelDetector,
  ascendingTriangleDetector,
  bearFlagDetector,
  bullFlagDetector,
  descendingChannelDetector,
  descendingTriangleDetector,
  fallingWedgeDetector,
  pennantDetector,
  risingWedgeDetector,
  symmetricalTriangleDetector,
} from "../detectors/geometry.detectors";

import {
  doubleBottomDetector,
  doubleTopDetector,
  tripleBottomDetector,
  tripleTopDetector,
} from "../detectors/reversal.detectors";

/**
 * The Pattern Registry.
 *
 * The Strategy Evaluator never constructs a detector. It asks for one by the name
 * in the contract's vocabulary — a strategy document says `"BULL_FLAG"`, a string —
 * and something has to turn that string into geometry. If it is not this class, it
 * ends up being a `switch` inside the evaluator, and that is where strategy logic
 * and pattern geometry begin to leak into each other.
 *
 * **Every name in the vocabulary resolves, or the application does not boot.** A
 * strategy referencing a pattern that silently does not exist would fail at
 * evaluation time — on a live market, on a signal that should have fired, with an
 * error nobody is watching. Failing at boot is free.
 */
@Injectable()
export class PatternRegistry implements OnModuleInit {
  private readonly logger = new Logger(PatternRegistry.name);
  private readonly detectors = new Map<Pattern, IPatternDetector>();

  constructor() {
    for (const detector of ALL_DETECTORS) {
      if (this.detectors.has(detector.pattern)) {
        // Two detectors claiming one name means one silently shadows the other, and
        // which one wins depends on import order.
        throw new Error(
          `Two detectors are both registered as "${detector.pattern}"`,
        );
      }

      this.detectors.set(detector.pattern, detector);
    }
  }

  onModuleInit(): void {
    const vocabulary = patternSchema.options as readonly Pattern[];

    const missing = vocabulary.filter((name) => !this.detectors.has(name));

    if (missing.length > 0) {
      throw new Error(
        `The pattern vocabulary and the engine disagree. The contract defines ` +
          `${missing.length} pattern(s) that nothing detects: ${missing.join(", ")}. ` +
          `A strategy could reference these, and it would fail on a live market rather than here.`,
      );
    }

    const extra = [...this.detectors.keys()].filter(
      (name) => !vocabulary.includes(name),
    );

    if (extra.length > 0) {
      throw new Error(
        `The engine detects patterns the contract does not define: ${extra.join(", ")}. ` +
          `No strategy can reference them — they are dead code pretending to be a feature.`,
      );
    }

    this.logger.log(
      { detectors: this.detectors.size },
      "Pattern registry populated — the vocabulary and the engine agree",
    );
  }

  resolve(pattern: Pattern): IPatternDetector {
    const detector = this.detectors.get(pattern);

    if (!detector) {
      throw new Error(`"${pattern}" is not a pattern this platform detects`);
    }

    return detector;
  }

  has(pattern: string): boolean {
    return this.detectors.has(pattern as Pattern);
  }

  all(): IPatternDetector[] {
    return [...this.detectors.values()];
  }
}

/**
 * Every detector, listed once.
 *
 * Explicit rather than discovered by scanning the filesystem — filesystem scanning
 * is "automatic" right up until a bundler tree-shakes a file nothing statically
 * imports, and then a detector vanishes from a production build and from no test.
 * This list is checked against the contract at boot, which gives the same guarantee
 * with none of the magic.
 */
const ALL_DETECTORS: IPatternDetector[] = [
  // structure — objective
  higherHighHigherLowDetector,
  lowerHighLowerLowDetector,
  breakOfStructureDetector,
  changeOfCharacterDetector,
  rangeDetector,
  equalHighsDetector,
  equalLowsDetector,

  // liquidity and gaps
  liquiditySweepDetector,
  fairValueGapDetector,
  orderBlockDetector,

  // reversal
  doubleTopDetector,
  doubleBottomDetector,
  tripleTopDetector,
  tripleBottomDetector,

  // geometry
  bullFlagDetector,
  bearFlagDetector,
  pennantDetector,
  fallingWedgeDetector,
  risingWedgeDetector,
  ascendingTriangleDetector,
  descendingTriangleDetector,
  symmetricalTriangleDetector,
  ascendingChannelDetector,
  descendingChannelDetector,
];
