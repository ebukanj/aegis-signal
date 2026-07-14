import { Global, Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { PrismaHealthIndicator } from "./prisma.health";
import { PrismaService } from "./prisma.service";

/**
 * Prisma is the ONLY way this application touches PostgreSQL (AGENTS.md §7).
 * No raw SQL unless performance demands it, and no second ORM, ever.
 */
@Global()
@Module({
  imports: [TerminusModule],
  providers: [PrismaService, PrismaHealthIndicator],
  exports: [PrismaService, PrismaHealthIndicator],
})
export class PrismaModule {}
