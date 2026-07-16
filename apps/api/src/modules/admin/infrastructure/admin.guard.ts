import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { AppConfigService } from "../../../config/app-config.service";
import { TokenService } from "../../auth/domain/token.service";

/**
 * The boundary on administrative actions.
 *
 * ── The role check the interim token promised (M16 delivered it) ──
 *
 * Real identity exists now, so the primary credential is a **signed-in ADMIN**: a
 * valid bearer token whose role is ADMIN or SUPER_ADMIN passes. The shared
 * `X-Admin-Token` secret remains as a secondary path for headless operators (CI,
 * curl on the box, monitoring) — a role for humans, a token for machines.
 *
 * Rails unchanged: with neither credential configured, production fails closed;
 * development stays open so the console works locally; the token comparison is
 * constant-time so it cannot be guessed by timing.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    /* 1 · A signed-in platform ADMIN. The primary, human path. */
    const bearer = request.headers.authorization;
    if (bearer?.startsWith("Bearer ")) {
      const claims = this.tokens.verify(bearer.slice("Bearer ".length).trim());
      if (claims && (claims.role === "ADMIN" || claims.role === "SUPER_ADMIN")) {
        return true;
      }
    }

    /* 2 · The operator token. The machine path. */
    const expected = process.env.ADMIN_API_TOKEN ?? "";

    if (!expected) {
      /* Fail closed in production; allow in dev so the admin UI works locally, but
       * say so loudly. */
      if (this.config.isProduction) {
        throw new ForbiddenException({
          code: "ADMIN_FORBIDDEN",
          message: "Admin access requires an ADMIN account or the operator token",
        });
      }
      this.logger.warn("ADMIN_API_TOKEN is not set — admin routes are OPEN in development only");
      return true;
    }

    const provided = String(request.headers["x-admin-token"] ?? "");
    if (!provided || !constantTimeEqual(provided, expected)) {
      throw new ForbiddenException({
        code: "ADMIN_FORBIDDEN",
        message: "Admin access requires an ADMIN account or a valid operator token",
      });
    }
    return true;
  }
}

/** Length-safe constant-time compare — no early return on the first differing byte. */
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
