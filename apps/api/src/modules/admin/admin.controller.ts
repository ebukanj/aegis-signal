import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import {
  adminOverviewSchema,
  auditEntrySchema,
  featureFlagSchema,
  maintenanceStateSchema,
} from "@aegis/contracts";
import { contract } from "../../common/contract";
import { AdminService } from "./application/admin.service";
import { AuditService } from "./application/audit/audit.service";
import { FeatureFlagsService } from "./application/configuration/feature-flags.service";
import { MaintenanceService } from "./application/maintenance/maintenance.service";
import { AdminGuard } from "./infrastructure/admin.guard";

const flagUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    rolloutPercent: z.number().min(0).max(100).optional(),
  })
  .refine((v) => v.enabled !== undefined || v.rolloutPercent !== undefined, {
    message: "Provide enabled and/or rolloutPercent",
  });

const maintenanceUpdateSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).optional(),
  readOnly: z.boolean().optional(),
  estimatedCompletion: z.number().int().positive().nullable().optional(),
});

/**
 * The operator's console — read the whole platform, flip the few levers it owns.
 *
 * ── Why the whole controller is behind the admin guard ──
 *
 * Even the read endpoints expose internal state — queue depths, error rates, the
 * platform's own calibration error — that a public API has no business handing out.
 * There is no user system yet, so the guard is a shared token: dev-open (so this
 * local admin UI just works), production-closed until real auth and roles arrive.
 * When they do, this guard becomes a role check and nothing else here moves.
 *
 * Every mutation names an actor and is audited by the service beneath it; this
 * controller only shapes requests and validates responses on the way out.
 */
@ApiTags("admin")
@UseGuards(AdminGuard)
@Controller({ path: "admin", version: "1" })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagsService,
    private readonly maintenance: MaintenanceService,
  ) {}

  @Get("overview")
  @ApiOperation({ summary: "The whole platform on one screen" })
  async overview() {
    return contract(adminOverviewSchema, await this.admin.overview());
  }

  @Get("audit")
  @ApiOperation({ summary: "Recent administrative actions (append-only)" })
  async auditLog() {
    const rows = await this.audit.recent(100);
    return contract(
      z.array(auditEntrySchema),
      rows.map((r) => ({ id: r.id, action: r.action, actor: r.actor, detail: r.detail, at: r.at })),
    );
  }

  @Get("flags")
  @ApiOperation({ summary: "All runtime feature flags" })
  flagList() {
    return contract(z.array(featureFlagSchema), this.flags.all());
  }

  @Post("flags/:key")
  @ApiOperation({ summary: "Flip a feature flag (kill switch / rollout)" })
  async setFlag(@Param("key") key: string, @Body() body: unknown, @Req() req: Request) {
    const change = flagUpdateSchema.parse(body);
    const updated = await this.flags.set(key, change, actorOf(req));
    return contract(featureFlagSchema, updated);
  }

  @Get("maintenance")
  @ApiOperation({ summary: "Current maintenance state" })
  maintenanceState() {
    return contract(maintenanceStateSchema, this.maintenance.current());
  }

  @Post("maintenance")
  @ApiOperation({ summary: "Enter or leave maintenance mode" })
  async setMaintenance(@Body() body: unknown, @Req() req: Request) {
    const input = maintenanceUpdateSchema.parse(body);
    const actor = actorOf(req);
    const state = input.enabled
      ? await this.maintenance.enable(
          {
            message: input.message ?? "Aegis Signal is undergoing maintenance.",
            readOnly: input.readOnly,
            estimatedCompletion: input.estimatedCompletion ?? null,
          },
          actor,
        )
      : await this.maintenance.disable(actor);
    return contract(maintenanceStateSchema, state);
  }
}

/**
 * Who is acting? Until there is an auth system, the best honest answer is the token's
 * bearer plus their address — never "system", which would launder a human's action
 * into the platform's. A named-but-anonymous operator is more truthful than a
 * comfortable lie.
 */
function actorOf(req: Request): string {
  const forwarded = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return `admin@${forwarded || req.ip || "local"}`;
}
