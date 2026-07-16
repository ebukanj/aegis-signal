import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Request } from "express";
import { MaintenanceService } from "../application/maintenance/maintenance.service";

/**
 * Turns requests away gracefully while the platform is under maintenance.
 *
 * A 503 with a message and a Retry-After is the platform behaving CORRECTLY under
 * planned work — clients, Cloudflare and a status page can all tell it apart from a
 * crash and back off. Two things always pass, on purpose:
 *
 *   - `/health*` and the admin API, so an operator can watch the platform and lift
 *     maintenance without fighting their own guard.
 *   - reads, when maintenance is in READ-ONLY mode — the softer variant that keeps
 *     the platform serving while a migration or backfill runs, rejecting only
 *     writes.
 */
@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(private readonly maintenance: MaintenanceService) {}

  canActivate(context: ExecutionContext): boolean {
    const state = this.maintenance.current();
    if (!state.enabled) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;

    /* The operator's own tools must never be locked out by maintenance: liveness,
     * the metrics a monitor scrapes, and the admin API used to lift maintenance. */
    if (
      path.startsWith("/health") ||
      path.startsWith("/metrics") ||
      path.startsWith("/api/v1/admin")
    )
      return true;

    /* Read-only mode: GET/HEAD/OPTIONS still flow; writes are turned away. */
    if (state.readOnly && ["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;

    throw new ServiceUnavailableException({
      code: "MAINTENANCE",
      message: state.message || "Aegis Signal is undergoing maintenance. Please try again shortly.",
      estimatedCompletion: state.estimatedCompletion,
      readOnly: state.readOnly,
    });
  }
}
