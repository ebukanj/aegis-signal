import { Global, Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { RedisHealthIndicator } from "./redis.health";
import { RedisService } from "./redis.service";

@Global()
@Module({
  imports: [TerminusModule],
  providers: [RedisService, RedisHealthIndicator],
  exports: [RedisService, RedisHealthIndicator],
})
export class RedisModule {}
