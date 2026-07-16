import { Controller, Get, Header, Res, VERSION_NEUTRAL } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
import { AdminService } from "./application/admin.service";
import { PrometheusService } from "./application/metrics/prometheus.service";

/**
 * Prometheus scrape target.
 *
 * Lives at exactly `/metrics`, VERSION_NEUTRAL and outside the API prefix, because a
 * scraper is infrastructure — it has no API version and its config should not move
 * when the API does (the same reasoning that keeps `/health` where it is). It is left
 * unauthenticated by deliberate convention: Prometheus scrapes without credentials,
 * and the surface carries only aggregate gauges and counters — never a signal, a
 * user, or a secret. In production it is reached over the internal network, not the
 * public edge; NGINX does not proxy it.
 */
@ApiExcludeController()
@Controller({ path: "metrics", version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(
    private readonly admin: AdminService,
    private readonly prometheus: PrometheusService,
  ) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async scrape(@Res() res: Response): Promise<void> {
    const gauges = await this.admin.gauges();
    res.send(this.prometheus.render(gauges));
  }
}
