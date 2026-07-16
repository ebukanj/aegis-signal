import { Module } from "@nestjs/common";

import { PrismaModule } from "../../core/database/prisma.module";
import { SignalModule } from "../signals/signal.module";
import { AuthModule } from "../auth/auth.module";

import { InAppChannel } from "./infrastructure/channels/in-app.channel";
import {
  EmailChannel,
  PushChannel,
  WhatsappChannel,
} from "./infrastructure/channels/external.channels";
import { TelegramChannel } from "./infrastructure/channels/telegram.channel";
import { TelegramClient } from "./infrastructure/telegram/telegram.client";
import { TelegramService } from "./application/telegram/telegram.service";
import { TelegramPollingWorker } from "./application/telegram/telegram-polling.worker";
import { ChannelRegistry } from "./application/channels/channel.registry";
import { TemplateRenderer } from "./application/templates/template.renderer";
import { PreferenceResolver } from "./application/preferences/preference.resolver";
import { NotificationPreferencesProvider } from "./application/preferences/notification-preferences.provider";
import { RetryPolicy } from "./application/retry/retry.policy";
import { NotificationOrchestrator } from "./application/orchestrator/notification.orchestrator";
import { EventRouter } from "./application/routing/event.router";
import { NotificationReadService } from "./application/read/notification-read.service";
import { NotificationRepository } from "./infrastructure/repository/notification.repository";
import { NotificationGateway } from "./infrastructure/notification.gateway";
import { NotificationController } from "./notification.controller";
import { TelegramController } from "./telegram.controller";

/**
 * THE NOTIFICATION ENGINE — the communication backbone.
 *
 * Everything important eventually passes through here on its way to a trader. Its
 * responsibilities are the right event, to the right user, through the right
 * channel, at the right time, EXACTLY ONCE, with full observability — and nothing
 * else. It never makes a trading decision, never introduces business logic, never
 * re-scores or re-judges what it delivers.
 *
 * ── Provider-agnostic, and fault-tolerant by construction ──
 *
 * Every channel hides behind one interface, so the platform can lose a provider
 * without losing notifications: an unconfigured or failing channel is skipped or
 * retried, and the in-app channel — which needs no external provider — always
 * delivers. Adding Telegram or SMS for real is a credential and a class, not a
 * redesign.
 */
@Module({
  imports: [PrismaModule, SignalModule, AuthModule],
  controllers: [NotificationController, TelegramController],
  providers: [
    InAppChannel,
    TelegramChannel,
    WhatsappChannel,
    EmailChannel,
    PushChannel,
    TelegramClient,
    TelegramService,
    TelegramPollingWorker,
    ChannelRegistry,
    TemplateRenderer,
    PreferenceResolver,
    NotificationPreferencesProvider,
    RetryPolicy,
    NotificationRepository,
    NotificationOrchestrator,
    EventRouter,
    NotificationReadService,
    NotificationGateway,
  ],
  exports: [NotificationOrchestrator, NotificationReadService],
})
export class NotificationModule {}
