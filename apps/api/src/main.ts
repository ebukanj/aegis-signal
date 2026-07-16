import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap/bootstrap";
import { AppConfigService } from "./config/app-config.service";

/**
 * Aegis Signal API — the backend that decides.
 *
 * Configuration comes from the environment and is validated before anything is
 * constructed. Nothing here hard-codes a port, a host, or `localhost`: this
 * process runs in a container behind Coolify (AGENTS.md §7).
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Buffer until Pino is attached, so the first few lines are not lost to
    // Nest's default console logger.
    bufferLogs: true,
    // We register the body parsers ourselves in configureApp so the payload-size
    // limit is ours, not Nest's silent 100kb default.
    bodyParser: false,
  });

  configureApp(app);

  const config = app.get(AppConfigService);
  const logger = app.get(Logger);

  // Everything this platform timestamps, it timestamps in UTC. A server in a
  // local timezone will silently mis-bucket candles, and a mis-bucketed candle
  // is a wrong indicator, which is a wrong signal.
  process.env.TZ = config.app.timezone;

  await app.listen(config.app.port, "0.0.0.0");

  logger.log(
    {
      port: config.app.port,
      env: config.env,
      timezone: config.app.timezone,
    },
    "Aegis Signal API is listening",
  );
}

void bootstrap();
