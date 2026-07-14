import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Redis } from "ioredis";
import { AppConfigService } from "../../config/app-config.service";

/**
 * Redis. Cache, pub/sub, and the backing store for every queue.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ and is not optional — with
 * a retry limit, a worker that blocks on a job will throw the moment Redis
 * hiccups, and the job is lost. Queues need a connection that waits rather than
 * one that gives up.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: AppConfigService) {
    this.client = new Redis(this.config.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      // Do not connect during construction — that would make the DI container
      // responsible for network I/O, and a slow Redis would look like a broken
      // application.
      lazyConnect: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    });

    this.client.on("error", (error: Error) => {
      // Never throw here: ioredis reconnects on its own, and an unhandled error
      // event takes the whole process down over a blip.
      this.logger.error({ err: error }, "Redis error");
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log("Redis connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log("Redis disconnected");
  }

  /** Used by the health check. Round-trips, rather than trusting a flag. */
  async ping(): Promise<void> {
    const reply = await this.client.ping();
    if (reply !== "PONG") {
      throw new Error(`Redis replied "${reply}" instead of PONG`);
    }
  }
}
