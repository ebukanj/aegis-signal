import { Injectable } from "@nestjs/common";
import { HealthCheckError, HealthIndicatorService } from "@nestjs/terminus";
import { Queue } from "bullmq";
import { RedisService } from "../cache/redis.service";
import { QUEUE } from "./queue.constants";

/**
 * Are the queues alive, and is anything piling up?
 *
 * "Connected" is not the same as "working". A queue with 40,000 waiting jobs and
 * no worker consuming them is perfectly connected and completely broken — and it
 * means the market data is stale, which means the signals are lies.
 *
 * So the check reports depth, and it reports failures. Coolify sees a healthy
 * container; a human sees the numbers.
 */
@Injectable()
export class QueueHealthIndicator {
  constructor(
    private readonly redis: RedisService,
    private readonly health: HealthIndicatorService,
  ) {}

  async isHealthy(key = "queue") {
    const indicator = this.health.check(key);

    try {
      const depths: Record<string, { waiting: number; failed: number }> = {};

      for (const name of Object.values(QUEUE)) {
        const queue = new Queue(name, { connection: this.redis.client });
        try {
          const [waiting, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getFailedCount(),
          ]);
          depths[name] = { waiting, failed };
        } finally {
          await queue.close();
        }
      }

      return indicator.up({ queues: depths });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Queues unreachable";
      indicator.down({ message });
      throw new HealthCheckError("Queues unhealthy", { [key]: { message } });
    }
  }
}
