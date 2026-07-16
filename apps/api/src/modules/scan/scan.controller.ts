import { Body, Controller, Get, Post } from "@nestjs/common";
import { scanRequestSchema, type ScanResult } from "@aegis/contracts";

import { ScanService } from "./application/scan.service";

/**
 * The Market Scanner's read/trigger API.
 *
 * `GET /scan` returns the most recent sweep — the Scanner page's initial paint.
 * `POST /scan` runs the scan the user asked for and returns its ranked result. It
 * is the SAME pipeline the background worker runs; a user-triggered scan is not a
 * different machine from the one the platform runs itself.
 *
 * This controller renders nothing and decides nothing — it validates the request
 * against the contract and hands off to the service (AGENTS.md §6).
 */
@Controller("scan")
export class ScanController {
  constructor(private readonly scan: ScanService) {}

  @Get()
  latest(): Promise<ScanResult> {
    return this.scan.latest();
  }

  @Post()
  run(@Body() body: unknown): Promise<ScanResult> {
    const request = scanRequestSchema.parse(body ?? {});
    return this.scan.scan(request);
  }
}
