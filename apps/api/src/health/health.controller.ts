import { Controller, Get, VERSION_NEUTRAL } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import type { HealthCheckResult } from "@nestjs/terminus";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaHealthIndicator } from "../core/database/prisma.health";
import { RedisHealthIndicator } from "../core/cache/redis.health";
import { QueueHealthIndicator } from "../core/queue/queue.health";
import { AppConfigService } from "../config/app-config.service";

/**
 * Health.
 *
 * Docker and Coolify hit this to decide whether the container is alive and
 * whether a deploy succeeded. **It must be honest, and it must actually check.**
 *
 * A health endpoint that returns `{ ok: true }` unconditionally is the most
 * dangerous line of code in an infrastructure repo: it tells the orchestrator
 * everything is fine while the database is unreachable, so the bad container
 * stays in rotation and the good one is never started. So every indicator here
 * round-trips — a real query, a real PING — rather than trusting that a client
 * object exists.
 *
 * `/health` is deliberately unauthenticated (an orchestrator has no
 * credentials) and deliberately says nothing about *what* the app does.
 */
/*
 * VERSION_NEUTRAL, and excluded from the global prefix, so this lives at exactly
 * `/health`.
 *
 * An orchestrator has no business knowing the API's version, and shipping v2
 * must never break the container's liveness probe. A health check that moves
 * when the API evolves is a health check that will one day report a perfectly
 * healthy container as dead, mid-deploy, at 3am.
 */
@ApiTags("health")
@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly queue: QueueHealthIndicator,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Liveness and dependency health" })
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prisma.isHealthy(),
      () => this.redis.isHealthy(),
      () => this.queue.isHealthy(),
    ]);
  }

  /**
   * Build and environment. Separate from `/health` because an orchestrator does
   * not care, and a human debugging a deploy cares about nothing else.
   *
   * Never returns a secret. Never returns a connection string.
   */
  @Get("info")
  @ApiOperation({ summary: "Build, version and environment" })
  info() {
    return {
      service: "aegis-api",
      version: process.env.npm_package_version ?? "0.1.0",
      commit: process.env.GIT_COMMIT ?? "unknown",
      environment: this.config.env,
      timezone: this.config.app.timezone,
      node: process.version,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
