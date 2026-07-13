import type { CalibrationPoint } from "@aegis/contracts";
import { BUILT_IN_STRATEGIES } from "@/constants/strategies";

/**
 * The scoreboard.
 *
 * Not an analytics workspace — the old one had heatmaps, radar charts and a
 * correlation matrix, and none of it answered the only question that matters:
 *
 *     **Have these signals actually made money?**
 *
 * And its harder companion, which is the one that decides whether this platform
 * is intelligence or decoration:
 *
 *     **When we say 90, are we right 90% of the time?**
 *
 * Today the honest answer to both is "we don't know yet" — no signal has
 * settled. That is the state this page is designed for, because a track record
 * page that fabricates a track record is worse than no page at all.
 */

export interface StrategyRecordRow {
  id: string;
  name: string;
  enabled: boolean;
  signals: number;
  wins: number;
  avgR: number | null;
  expectancy: number | null;
}

export interface TrackRecord {
  /** Signals we have emitted and which have since resolved. */
  settledSignals: number;
  wins: number;
  avgR: number | null;
  expectancy: number | null;
  /** Days since the platform started recording. */
  trackingDays: number;

  strategies: StrategyRecordRow[];

  /**
   * The reliability curve: what we predicted vs what happened.
   *
   * Empty until there are outcomes. When it fills, a point sitting below the
   * diagonal means we are overconfident at that score — and overconfidence is
   * how a trader gets talked into a bad trade by a number.
   */
  calibration: CalibrationPoint[];
  historicalCalibration: CalibrationPoint[];
}

export function getMockTrackRecord(): TrackRecord {
  return {
    // Nothing has settled. The platform has emitted no live signal that has
    // reached its stop or its target, because it is not connected to a market.
    settledSignals: 0,
    wins: 0,
    avgR: null,
    expectancy: null,
    trackingDays: 0,

    strategies: BUILT_IN_STRATEGIES.map((s) => ({
      id: s.id,
      name: s.name,
      enabled: s.enabled,
      signals: s.record?.signals ?? 0,
      wins: s.record?.wins ?? 0,
      avgR: s.record?.avgR ?? null,
      expectancy: s.record?.expectancy ?? null,
    })),

    // Both empty: no live outcomes, and the historical replay needs exchange
    // candles the platform does not have yet.
    calibration: [],
    historicalCalibration: [],
  };
}
