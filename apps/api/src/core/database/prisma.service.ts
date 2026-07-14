import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * The database connection.
 *
 * `enableShutdownHooks` on the Nest app plus `OnModuleDestroy` here is what lets
 * a container stop *cleanly*: in-flight queries finish, the pool drains, and
 * nothing is left half-written. Coolify will restart this process on every
 * deploy, so "shuts down properly" is a thing that happens several times a week,
 * not a theoretical nicety.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Prisma's own logs go through Pino like everything else — one log stream,
      // one format, one place to look (AGENTS.md §7).
      log: [
        { emit: "event", level: "warn" },
        { emit: "event", level: "error" },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Database connected");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Database disconnected");
  }

  /** Used by the health check. Cheap, and it actually round-trips. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
