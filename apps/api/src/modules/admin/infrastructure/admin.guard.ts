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

/**
 * The boundary on administrative actions.
 *
 * ── An interim boundary, and honest about it ──
 *
 * There is no user or auth system yet (that is a later milestone), so admin actions
 * are gated by a shared secret: the `X-Admin-Token` header must match
 * `ADMIN_API_TOKEN`. This is deliberately simple and deliberately NOT the end state
 * — when auth lands, this guard becomes a role check and the token is retired. But
 * "no auth yet" must never mean "anyone can flip a kill switch", so the boundary
 * exists now, in the weakest honest form.
 *
 * Two safety rails:
 *   - If no token is configured, admin MUTATIONS are refused outright in production
 *     (a blank secret is not a valid secret) — the platform fails closed.
 *   - The comparison is constant-time, so the token cannot be guessed by timing.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = process.env.ADMIN_API_TOKEN ?? "";

    if (!expected) {
      /* Fail closed in production; allow in dev so the admin UI works locally, but
       * say so loudly. */
      if (this.config.isProduction) {
        throw new ForbiddenException({
          code: "ADMIN_NOT_CONFIGURED",
          message: "ADMIN_API_TOKEN is not set — admin mutations are refused",
        });
      }
      this.logger.warn("ADMIN_API_TOKEN is not set — admin routes are OPEN in development only");
      return true;
    }

    const provided = String(request.headers["x-admin-token"] ?? "");
    if (!provided || !constantTimeEqual(provided, expected)) {
      throw new ForbiddenException({ code: "ADMIN_FORBIDDEN", message: "Invalid admin token" });
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
