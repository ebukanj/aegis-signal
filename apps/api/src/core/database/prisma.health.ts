import { Injectable } from "@nestjs/common";
import {
  HealthCheckError,
  HealthIndicatorService,
} from "@nestjs/terminus";
import { PrismaService } from "./prisma.service";

/**
 * Is the database actually reachable — not merely "did we once connect"?
 *
 * A health check that returns OK because a client object exists is worse than no
 * health check: it will tell Coolify the container is fine while every request
 * times out. So this issues a real query.
 */
@Injectable()
export class PrismaHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: HealthIndicatorService,
  ) {}

  async isHealthy(key = "database") {
    const indicator = this.health.check(key);
    const start = Date.now();

    try {
      await this.prisma.ping();
      return indicator.up({ latencyMs: Date.now() - start });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Database unreachable";
      indicator.down({ message });
      throw new HealthCheckError("Database unhealthy", { [key]: { message } });
    }
  }
}
