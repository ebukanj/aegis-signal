import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { AppConfigService } from "./app-config.service";
import { validateEnv } from "./env.schema";

/**
 * Configuration. Global, because everything needs it and nothing should have to
 * import it to get it.
 *
 * `validate` runs before any provider is constructed, so an invalid environment
 * kills the process at boot rather than at the first request that happens to
 * touch the missing value.
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Real deployments inject env vars (Coolify). A .env file is a
      // development convenience and must never be required.
      envFilePath: [".env.local", ".env"],
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
