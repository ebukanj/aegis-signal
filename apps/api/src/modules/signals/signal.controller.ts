import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  opportunitySchema,
  signalDetailResponseSchema,
} from "@aegis/contracts";
import { contract } from "../../common/contract";
import { DomainError } from "../../common/errors/domain-error";
import { SignalReadService } from "./application/read/signal-read.service";

/**
 * The Signal API — read-only, and validated on the way out.
 *
 * Every response passes through `contract()`: a signal whose stop is on the wrong
 * side of its entry, or whose leverage contradicts its market type, never reaches
 * a client because it never leaves this building (ADR-022). The frontend renders
 * these values; it computes none of them.
 *
 * There is no POST here. The Signal Engine publishes to the internal event stream,
 * not to an HTTP caller — a signal is EARNED through the pipeline, never injected.
 */
@ApiTags("signals")
@Controller({ path: "signals", version: "1" })
export class SignalController {
  constructor(private readonly read: SignalReadService) {}

  /**
   * The feed — today's published signals, in two tiers (Prime / validated).
   *
   * A quiet feed is a successful feed if the rules produced nothing (AGENTS.md §1).
   * When there is nothing to show, this returns empty tiers and the UI says so,
   * rather than inventing a trade to fill the space.
   */
  @Get("today")
  @ApiOperation({ summary: "Today's published signals — Prime and validated" })
  async today() {
    const feed = await this.read.feed(Date.now());
    return {
      context: feed.context,
      prime: contract(z.array(opportunitySchema), feed.prime),
      validated: contract(z.array(opportunitySchema), feed.validated),
    };
  }

  @Get(":id")
  @ApiOperation({ summary: "One published signal, with rank-neighbours" })
  async detail(@Param("id") id: string) {
    const response = await this.read.detail(id, Date.now());
    if (!response) {
      throw DomainError.notFound(`No published signal with id ${id}`);
    }
    return contract(signalDetailResponseSchema, response);
  }
}
