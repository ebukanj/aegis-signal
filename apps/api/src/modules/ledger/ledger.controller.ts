import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { trackRecordViewSchema } from "@aegis/contracts";
import { contract } from "../../common/contract";
import { DomainError } from "../../common/errors/domain-error";
import { TrackRecordReadService } from "./application/read/track-record.read-service";
import { LedgerService } from "./application/services/ledger.service";

/**
 * The Track Record & Ledger API — read-only.
 *
 * The ledger is the platform's permanent memory. Everything here is a read of what
 * already happened; there is no endpoint to change a settled outcome, because a
 * settled outcome cannot be changed. History has exactly one account.
 */
@ApiTags("track-record")
@Controller({ path: "track-record", version: "1" })
export class LedgerController {
  constructor(
    private readonly trackRecord: TrackRecordReadService,
    private readonly ledger: LedgerService,
  ) {}

  /** The public track record — the number a trader checks before trusting the rest. */
  @Get()
  @ApiOperation({ summary: "The platform's track record and reliability curve" })
  async record() {
    return contract(trackRecordViewSchema, await this.trackRecord.view());
  }

  /** One signal's complete, ordered life in the ledger — registration to settlement. */
  @Get("signal/:id")
  @ApiOperation({ summary: "One signal's immutable ledger entry and audit trail" })
  async signal(@Param("id") id: string) {
    const entry = await this.ledger.entry(id);
    if (!entry) throw DomainError.notFound(`No ledger entry for ${id}`);
    const audit = await this.ledger.history(id);
    return { entry, audit };
  }
}
