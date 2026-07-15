"use client";

import { io, type Socket } from "socket.io-client";

/**
 * The live wire for the feed.
 *
 * The whole product is "here is a trade worth taking RIGHT NOW". A feed that only
 * changes when you reload the page is stale intelligence — a signal that got
 * stopped out ten minutes ago should not still be sitting there inviting you in.
 *
 * The backend broadcasts a tiny `signals:changed` nudge whenever a signal is
 * published or the Settlement Worker settles one (a target hit, a stop hit, a
 * setup missed). This module holds one socket to the `signals` namespace and calls
 * every listener on that nudge; the feed's React Query then refetches, re-ranks,
 * and drops what has settled — no polling, no manual refresh.
 *
 * A nudge, not the data: "something changed, come and look." The read is cheap and
 * cannot drift from the source of truth the way a pushed payload can.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ChangeListener = () => void;

let socket: Socket | null = null;
const listeners = new Set<ChangeListener>();

function ensureSocket(): void {
  if (socket) return;

  socket = io(`${API_URL}/signals`, {
    transports: ["websocket"],
    reconnection: true,
  });

  socket.on("signals:changed", () => {
    for (const listener of listeners) listener();
  });
}

/** Subscribe to feed-changed nudges. Returns an unsubscribe. */
export function onSignalsChanged(listener: ChangeListener): () => void {
  ensureSocket();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    /* Last one out closes the socket — no point holding a connection nobody uses. */
    if (listeners.size === 0 && socket) {
      socket.disconnect();
      socket = null;
    }
  };
}
