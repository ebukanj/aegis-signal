import { Injectable } from "@nestjs/common";
import { userPreferencesSchema } from "@aegis/contracts";

import { UserRepository } from "../infrastructure/user.repository";

/**
 * The watchlist, seen from the platform's side rather than one user's.
 *
 * A user manages their OWN watchlist through preferences; the scan needs the
 * OPPOSITE view — every coin any user is watching, unioned — so it can guarantee
 * those coins are scanned every sweep, ahead of the general universe and before
 * the size cap can drop them. That is what "watch my coins as priority" means in
 * practice: an opportunity on a watched coin is never missed because the sweep ran
 * out of budget elsewhere.
 *
 * It is exported by the AuthModule and read by the scan — the scan depends on
 * identity, never the other way around.
 */
@Injectable()
export class WatchlistService {
  constructor(private readonly users: UserRepository) {}

  /** Every distinct coin any user watches. Empty when nobody watches anything. */
  async union(): Promise<string[]> {
    const all = await this.users.allPreferences();
    const coins = new Set<string>();

    for (const { data } of all) {
      // Parse through the schema so a malformed or partial blob yields a safe,
      // fully-defaulted preferences object rather than throwing.
      const prefs = userPreferencesSchema.parse(data ?? {});
      for (const coin of prefs.watchlist) coins.add(coin);
    }

    return [...coins];
  }

  /** The user ids watching a given coin — for per-user delivery (Phase 4). */
  async watchersOf(coin: string): Promise<string[]> {
    const all = await this.users.allPreferences();
    const watchers: string[] = [];

    for (const { userId, data } of all) {
      const prefs = userPreferencesSchema.parse(data ?? {});
      if (prefs.watchlist.includes(coin)) watchers.push(userId);
    }

    return watchers;
  }
}
