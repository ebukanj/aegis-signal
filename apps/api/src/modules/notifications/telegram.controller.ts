import { Controller, Delete, Get, HttpCode, Post, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/auth.decorators";
import { TelegramService, type TelegramStatus } from "./application/telegram/telegram.service";

/**
 * The user-facing side of Telegram linking. All behind the identity guard — a
 * link belongs to whoever is signed in, and nobody else can connect a chat to
 * someone else's account.
 */
@Controller("telegram")
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get("status")
  status(@CurrentUser("sub") userId: string): Promise<TelegramStatus> {
    return this.telegram.status(userId);
  }

  /** Begin linking — returns the `t.me` deep link the user taps to connect. */
  @Post("link")
  link(
    @CurrentUser("sub") userId: string,
  ): Promise<{ deepLink: string; botUsername: string; expiresInMinutes: number }> {
    return this.telegram.beginLink(userId);
  }

  @Delete()
  @HttpCode(204)
  async unlink(@CurrentUser("sub") userId: string): Promise<void> {
    await this.telegram.unlink(userId);
  }
}
