import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { insightsFeedSchema, insightSchema } from "@aegis/contracts";
import { z } from "zod";
import { contract } from "../../common/contract";
import { InsightsReadService } from "./application/read/insights-read.service";
import { InsightsService } from "./application/services/insights.service";

/**
 * The Insights API — read-only, and validated on the way out.
 *
 * It serves context: news, active risk flags, per-asset awareness. There is no
 * endpoint to raise a flag or publish a story by hand — insights are COLLECTED from
 * the world, never injected, because a veto anyone could POST is a veto anyone
 * could abuse.
 */
@ApiTags("insights")
@Controller({ path: "insights", version: "1" })
export class InsightsController {
  constructor(
    private readonly read: InsightsReadService,
    private readonly insights: InsightsService,
  ) {}

  /** The Insights page feed: real news + active risk flags. */
  @Get()
  @ApiOperation({ summary: "News, risk flags and market context" })
  async feed() {
    return contract(insightsFeedSchema, await this.read.feed());
  }

  /** Everything the platform knows about one asset's context — feeds Signal Detail. */
  @Get("asset/:coin")
  @ApiOperation({ summary: "One asset's news and active risk flags" })
  async asset(@Param("coin") coin: string) {
    return this.read.assetContext(coin);
  }

  /** A filterable historical timeline. */
  @Get("timeline")
  @ApiOperation({ summary: "Filterable insight timeline" })
  async timeline(@Query("scope") scope = "ALL", @Query("key") key?: string) {
    const s = ["ASSET", "EXCHANGE", "MACRO", "PROJECT", "ALL"].includes(scope)
      ? (scope as "ASSET" | "EXCHANGE" | "MACRO" | "PROJECT" | "ALL")
      : "ALL";
    const timeline = await this.read.timeline(s, key ?? null);
    return { ...timeline, items: contract(z.array(insightSchema), timeline.items) };
  }

  @Get("search")
  @ApiOperation({ summary: "Search insights by keyword, coin, category, severity, date" })
  async search(
    @Query("q") keyword?: string,
    @Query("coin") coin?: string,
    @Query("category") category?: string,
    @Query("severity") severity?: string,
  ) {
    const items = await this.read.search({ keyword, coin, category, severity, limit: 100 });
    return contract(z.array(insightSchema), items);
  }

  /** Collector health and volume — feeds the Administration dashboard. */
  @Get("health")
  @ApiOperation({ summary: "Collector health and insight metrics" })
  async health() {
    return this.insights.metrics();
  }
}
