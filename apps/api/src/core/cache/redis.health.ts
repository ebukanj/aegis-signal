import { Injectable } from "@nestjs/common";
import { HealthCheckError, HealthIndicatorService } from "@nestjs/terminus";
import { RedisService } from "./redis.service";

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redis: RedisService,
    private readonly health: HealthIndicatorService,
  ) {}

  async isHealthy(key = "redis") {
    const indicator = this.health.check(key);
    const start = Date.now();

    try {
      await this.redis.ping();
      return indicator.up({ latencyMs: Date.now() - start });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Redis unreachable";
      indicator.down({ message });
      throw new HealthCheckError("Redis unhealthy", { [key]: { message } });
    }
  }
}
