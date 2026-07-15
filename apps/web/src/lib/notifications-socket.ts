"use client";

import { io, type Socket } from "socket.io-client";

/**
 * The live wire for notifications.
 *
 * The Notification Engine's in-app channel broadcasts a `notification` event over
 * the `notifications` namespace whenever it delivers. This holds one socket and
 * fans it out to listeners — a global toast, and the Notifications page refetching
 * its history — so a Prime signal or a stop-loss reaches the trader the instant it
 * happens, without a refresh.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface LiveNotification {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string;
  link: string | null;
  at: number;
}

type Listener = (n: LiveNotification) => void;

let socket: Socket | null = null;
const listeners = new Set<Listener>();

function ensureSocket(): void {
  if (socket) return;
  socket = io(`${API_URL}/notifications`, { transports: ["websocket"], reconnection: true });
  socket.on("notification", (payload: LiveNotification) => {
    for (const listener of listeners) listener(payload);
  });
}

/** Subscribe to live deliveries. Returns an unsubscribe. */
export function onNotification(listener: Listener): () => void {
  ensureSocket();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && socket) {
      socket.disconnect();
      socket = null;
    }
  };
}
