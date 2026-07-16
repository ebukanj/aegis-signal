import { Injectable, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../../../../core/database/prisma.service";
import { AuditService } from "../audit/audit.service";

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  /** Read-only mode: reads allowed, writes rejected. */
  readOnly: boolean;
  estimatedCompletion: number | null;
  enabledAt: number | null;
}

const KEY = "maintenance";
const DEFAULT: MaintenanceState = {
  enabled: false,
  message: "",
  readOnly: false,
  estimatedCompletion: null,
  enabledAt: null,
};

/**
 * Maintenance mode — take the platform down for work, gracefully.
 *
 * When enabled, the maintenance guard turns requests away with a 503 and a clear
 * message rather than letting them hit a half-migrated database or a draining
 * queue. The distinction from a crash matters: a 503 with "back at 04:00 UTC" is the
 * platform behaving correctly under planned work; a timeout or a 500 is the platform
 * failing. Clients (and Cloudflare, and a status page) can tell the two apart and
 * act accordingly.
 *
 * Read-only mode is the softer version — the platform keeps serving reads while a
 * migration or a backfill runs, and rejects only writes. State is persisted so it
 * survives the very restarts maintenance usually involves, and every toggle is
 * audited.
 */
@Injectable()
export class MaintenanceService implements OnModuleInit {
  private state: MaintenanceState = { ...DEFAULT };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    const row = await this.prisma.adminSetting.findUnique({ where: { key: KEY } });
    if (row) this.state = { ...DEFAULT, ...(row.value as object) };
  }

  current(): MaintenanceState {
    return this.state;
  }

  async enable(
    input: { message: string; readOnly?: boolean; estimatedCompletion?: number | null },
    actor: string,
  ): Promise<MaintenanceState> {
    return this.write(
      {
        enabled: true,
        message: input.message,
        readOnly: input.readOnly ?? false,
        estimatedCompletion: input.estimatedCompletion ?? null,
        enabledAt: Date.now(),
      },
      actor,
      `maintenance ${input.readOnly ? "(read-only) " : ""}enabled: ${input.message}`,
    );
  }

  async disable(actor: string): Promise<MaintenanceState> {
    return this.write({ ...DEFAULT }, actor, "maintenance disabled");
  }

  private async write(state: MaintenanceState, actor: string, detail: string): Promise<MaintenanceState> {
    await this.prisma.adminSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: state as object, updatedBy: actor },
      update: { value: state as object, updatedBy: actor },
    });
    this.state = state;
    await this.audit.record({ action: "maintenance.set", actor, detail, metadata: { state }, at: Date.now() });
    return state;
  }
}
