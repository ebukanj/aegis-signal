import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { indicatorSchema, type Indicator, type IndicatorParams } from "@aegis/contracts";
import type { IIndicator } from "../../domain/indicator.interface";
import { UnknownIndicatorError } from "../../domain/indicator.errors";

import {
  closeCalculator,
  cvdCalculator,
  emaCalculator,
  highCalculator,
  lowCalculator,
  obvCalculator,
  openCalculator,
  smaCalculator,
  volumeCalculator,
  volumeSmaCalculator,
  vwapCalculator,
} from "../calculators/price-volume.calculators";

import {
  cciCalculator,
  kdjDCalculator,
  kdjJCalculator,
  kdjKCalculator,
  macdHistogramCalculator,
  macdLineCalculator,
  macdSignalCalculator,
  mfiCalculator,
  rocCalculator,
  rsiCalculator,
  stochDCalculator,
  stochKCalculator,
  williamsRCalculator,
} from "../calculators/momentum.calculators";

import {
  adxCalculator,
  ichimokuKijunCalculator,
  ichimokuSpanACalculator,
  ichimokuSpanBCalculator,
  ichimokuTenkanCalculator,
  minusDiCalculator,
  plusDiCalculator,
  psarCalculator,
  supertrendCalculator,
} from "../calculators/trend.calculators";

import {
  atrCalculator,
  bbLowerCalculator,
  bbMiddleCalculator,
  bbUpperCalculator,
  bbWidthCalculator,
  donchianLowerCalculator,
  donchianUpperCalculator,
  fundingRateCalculator,
  highestHighCalculator,
  keltnerLowerCalculator,
  keltnerUpperCalculator,
  longShortRatioCalculator,
  lowestLowCalculator,
  openInterestCalculator,
  zscoreCalculator,
} from "../calculators/volatility.calculators";

/**
 * The Indicator Registry — one place that knows what an indicator IS.
 *
 * The Strategy Evaluator never constructs an indicator. It asks for one by the
 * name in the contract's vocabulary and gets back something that satisfies
 * `IIndicator`. That indirection is the whole point:
 *
 *   · A strategy is a DOCUMENT (ADR-023), and a document names `"rsi"` — a
 *     string. Something has to turn that string into arithmetic, and if it is not
 *     this class it will end up being a `switch` inside the evaluator, which is
 *     where strategy logic and indicator maths begin to leak into each other.
 *
 *   · A user-created strategy takes the identical path as a built-in one. There
 *     is no privileged list of "real" indicators that only our strategies may use.
 *
 * ── The invariant that matters ──
 *
 * **Every name in the contract's vocabulary resolves, or the application does not
 * boot.** `onModuleInit` checks it. A strategy referencing an indicator that
 * silently does not exist would fail at evaluation time — on a live market, on a
 * signal that should have fired, with an error nobody is watching. Failing at boot
 * is free.
 */
@Injectable()
export class IndicatorRegistry implements OnModuleInit {
  private readonly logger = new Logger(IndicatorRegistry.name);
  private readonly indicators = new Map<Indicator, IIndicator>();

  constructor() {
    for (const calculator of ALL_CALCULATORS) {
      this.register(calculator);
    }
  }

  /**
   * Boot-time proof that the vocabulary and the implementations agree.
   *
   * The contract says a strategy may reference 47 indicators. If the engine
   * implements 46, the 47th is a landmine: the strategy editor will happily offer
   * it, a user will build a strategy on it, and it will explode the first time a
   * candle closes.
   */
  onModuleInit(): void {
    const vocabulary = indicatorSchema.options as readonly Indicator[];
    const missing = vocabulary.filter((name) => !this.indicators.has(name));

    if (missing.length > 0) {
      throw new Error(
        `The indicator vocabulary and the engine disagree. ` +
          `The contract defines ${missing.length} indicator(s) that nothing implements: ` +
          `${missing.join(", ")}. A strategy could reference these, and it would fail ` +
          `on a live market rather than here.`,
      );
    }

    const extra = [...this.indicators.keys()].filter(
      (name) => !vocabulary.includes(name),
    );

    if (extra.length > 0) {
      throw new Error(
        `The engine implements indicators the contract does not define: ${extra.join(", ")}. ` +
          `No strategy can ever reference them — they are dead code pretending to be a feature.`,
      );
    }

    this.logger.log(
      { indicators: this.indicators.size },
      "Indicator registry populated — the vocabulary and the engine agree",
    );
  }

  private register(indicator: IIndicator): void {
    if (this.indicators.has(indicator.name)) {
      // Two calculators claiming one name means one of them silently wins, and
      // which one depends on import order. Never let that ship.
      throw new Error(
        `Two calculators are both registered as "${indicator.name}". One would silently shadow the other.`,
      );
    }

    this.indicators.set(indicator.name, indicator);
  }

  /** Resolve a name to its implementation. Throws rather than returning undefined. */
  resolve(name: Indicator): IIndicator {
    const indicator = this.indicators.get(name);
    if (!indicator) throw new UnknownIndicatorError(name);

    return indicator;
  }

  has(name: string): boolean {
    return this.indicators.has(name as Indicator);
  }

  /**
   * The caller's parameters, over the calculator's defaults.
   *
   * Done here rather than in each calculator so there is exactly one merge rule.
   * `undefined` never overwrites a default — a caller who omits `period` wants the
   * conventional one, not `undefined`, and `{...defaults, ...params}` with an
   * explicit `period: undefined` in `params` would hand them the latter.
   */
  parametersFor(name: Indicator, params: IndicatorParams = {}): IndicatorParams {
    const defaults = this.resolve(name).defaults;

    const provided = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined),
    );

    return { ...defaults, ...provided };
  }

  /** Everything the platform can compute. Feeds the strategy editor. */
  all(): IIndicator[] {
    return [...this.indicators.values()];
  }
}

/**
 * Every calculator, listed once.
 *
 * Explicit rather than auto-discovered by scanning the filesystem. Filesystem
 * scanning is "self-registering" right up until a bundler tree-shakes a file
 * nothing statically imports, and then an indicator vanishes from a production
 * build and not from any test. This list is verified against the contract at boot,
 * which gives the same guarantee with none of the magic.
 */
const ALL_CALCULATORS: IIndicator[] = [
  // price
  openCalculator,
  highCalculator,
  lowCalculator,
  closeCalculator,

  // volume
  volumeCalculator,
  volumeSmaCalculator,
  obvCalculator,
  cvdCalculator,
  vwapCalculator,

  // moving averages
  smaCalculator,
  emaCalculator,

  // momentum
  rsiCalculator,
  macdLineCalculator,
  macdSignalCalculator,
  macdHistogramCalculator,
  stochKCalculator,
  stochDCalculator,
  kdjKCalculator,
  kdjDCalculator,
  kdjJCalculator,
  cciCalculator,
  williamsRCalculator,
  rocCalculator,
  mfiCalculator,

  // trend
  adxCalculator,
  plusDiCalculator,
  minusDiCalculator,
  supertrendCalculator,
  psarCalculator,
  ichimokuTenkanCalculator,
  ichimokuKijunCalculator,
  ichimokuSpanACalculator,
  ichimokuSpanBCalculator,

  // volatility
  atrCalculator,
  bbUpperCalculator,
  bbMiddleCalculator,
  bbLowerCalculator,
  bbWidthCalculator,
  keltnerUpperCalculator,
  keltnerLowerCalculator,
  donchianUpperCalculator,
  donchianLowerCalculator,

  // structure
  highestHighCalculator,
  lowestLowCalculator,

  // derivatives — present, and honestly unavailable
  fundingRateCalculator,
  openInterestCalculator,
  longShortRatioCalculator,

  // statistics
  zscoreCalculator,
];
