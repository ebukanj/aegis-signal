import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import { AppConfigModule } from "../../config/config.module";
import { AppConfigService } from "../../config/app-config.service";

/**
 * Structured logging. `console.log` is banned (AGENTS.md §7).
 *
 * Two things here are not decoration:
 *
 * REQUEST IDS. Every log line from a request carries the same id, so a failure
 * three modules deep can be traced back to the call that caused it. Without
 * this, debugging a production incident means reading interleaved log lines from
 * a dozen concurrent requests and guessing.
 *
 * REDACTION. Secrets must never reach a log file, because log files get copied,
 * shipped to third parties, and pasted into tickets. An auth header in a log is
 * a credential in a place nobody is guarding.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logging.level,

          // Human-readable in development; JSON in production, where a log
          // aggregator is reading it and prettiness costs money.
          transport: config.isProduction
            ? undefined
            : {
                target: "pino-pretty",
                options: {
                  singleLine: true,
                  colorize: true,
                  translateTime: "HH:MM:ss",
                  ignore: "pid,hostname,req.headers,res.headers",
                },
              },

          genReqId: (req, res) => {
            const existing =
              (req.headers["x-request-id"] as string | undefined) ??
              (req.headers["x-correlation-id"] as string | undefined);
            const id = existing ?? randomUUID();
            res.setHeader("x-request-id", id);
            return id;
          },

          customProps: () => ({ service: "aegis-api" }),

          // Health checks would otherwise drown every other line.
          autoLogging: {
            ignore: (req) => req.url === "/api/health",
          },

          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.body.password",
              "req.body.token",
              "res.headers['set-cookie']",
              "*.jwtSecret",
              "*.apiKey",
              "*.secret",
              "*.password",
              "*.token",
            ],
            censor: "[redacted]",
          },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
