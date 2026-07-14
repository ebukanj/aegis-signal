import {
  type INestApplication,
  Logger,
  VersioningType,
} from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger as PinoLogger } from "nestjs-pino";
import compression from "compression";
import helmet from "helmet";
import { AppConfigService } from "../config/app-config.service";
import { AllExceptionsFilter } from "../filters/all-exceptions.filter";

/**
 * Everything the application needs before it accepts a request.
 *
 * Kept out of `main.ts` so it can be applied identically in tests — a test that
 * bypasses the exception filter is a test that proves nothing about production.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfigService);

  /* Logging — Pino replaces Nest's default logger entirely. No console.log. */
  app.useLogger(app.get(PinoLogger));

  /* Security headers. */
  app.use(
    helmet({
      // Swagger's UI needs inline styles; it only runs outside production.
      contentSecurityPolicy: config.isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(compression());

  /*
   * CORS is an allow-list, never a wildcard.
   *
   * `origin: true` reflects whatever origin asked, which is not CORS — it is CORS
   * turned off while looking like it is on. This API will one day carry
   * authenticated portfolio data.
   */
  app.enableCors({
    origin: config.app.corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });

  /* Versioning — /api/v1/... . Breaking a client silently is not an option. */
  app.setGlobalPrefix("api", { exclude: ["health", "health/info"] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: "1",
  });

  /* One error shape for everything (filters/all-exceptions.filter.ts). */
  app.useGlobalFilters(new AllExceptionsFilter());

  /*
   * Graceful shutdown.
   *
   * Coolify restarts this process on every deploy. Without hooks, an in-flight
   * risk validation is killed mid-write and the Prisma pool is severed rather
   * than drained. This makes "stopping" a thing the app does, rather than a
   * thing done to it.
   */
  app.enableShutdownHooks();

  /* API documentation — development only. Never expose the surface in prod. */
  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Aegis Signal API")
        .setDescription(
          "Measure the Market. Protect the Trader. — The backend decides; the frontend renders.",
        )
        .setVersion("1.0")
        .addBearerAuth()
        .build(),
    );

    SwaggerModule.setup("api/docs", app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    new Logger("Bootstrap").log("API docs at /api/docs");
  }
}
