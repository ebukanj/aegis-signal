import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { TerminusModule } from "@nestjs/terminus";
import { AppConfigService } from "../../config/app-config.service";
import { RedisService } from "../cache/redis.service";
import { QueueHealthIndicator } from "./queue.health";
import { DEFAULT_JOB_OPTIONS, QUEUE } from "./queue.constants";

/**
 * BullMQ. Registered, empty, and waiting.
 *
 * The queues exist from the first commit even though nothing produces jobs yet.
 * That is intentional: the pipeline's shape is a decision (AGENTS.md §5), and
 * declaring it in infrastructure means a future contributor adding a seventh
 * queue has to think about why — rather than discovering the pipeline one job at
 * a time.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: {
          url: config.redis.url,
          // BullMQ blocks on Redis; a retry cap would drop jobs on a hiccup.
          maxRetriesPerRequest: null,
        },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),

    ...Object.values(QUEUE).map((name) => BullModule.registerQueue({ name })),

    TerminusModule,
  ],
  providers: [QueueHealthIndicator, RedisService],
  exports: [BullModule, QueueHealthIndicator],
})
export class QueueModule {}
