import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { notificationOverviewSchema } from "@aegis/contracts";
import { contract } from "../../common/contract";
import { NotificationReadService } from "./application/read/notification-read.service";

/**
 * The Notifications API — read-only.
 *
 * The engine delivers; there is no endpoint to send a notification by hand, because
 * a notification is EARNED by a platform event, never injected. This surface only
 * reports what was delivered, to which channel, and how it went.
 */
@ApiTags("notifications")
@Controller({ path: "notifications", version: "1" })
export class NotificationController {
  constructor(private readonly read: NotificationReadService) {}

  /** The Notifications page: recent deliveries, channel health, stats, preferences. */
  @Get()
  @ApiOperation({ summary: "Notification history, channel health and delivery stats" })
  async overview() {
    return contract(notificationOverviewSchema, await this.read.overview());
  }

  /** Delivery metrics for the Administration dashboard. */
  @Get("health")
  @ApiOperation({ summary: "Notification delivery metrics and channel health" })
  async health() {
    return this.read.metrics();
  }
}
