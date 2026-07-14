"use client";

import { io, type Socket } from "socket.io-client";

/**
 * The market feed. Real prices, from the backend, over one socket.
 *
 * **One connection for the whole application**, not one per component. A signals
 * page renders a dozen cards; a dozen sockets would be a dozen handshakes, a
 * dozen reconnect storms when the network hiccups, and twelve times the ticks the
 * browser has to render. Components subscribe to a symbol; the module keeps a
 * single socket and fans out.
 *
 * The frontend NEVER computes a price (AGENTS.md §6). It renders what the backend
 * sends, and when nothing is being sent it says so rather than inventing a
 * plausible number — which is exactly what the mock this replaces used to do.
 */

export interface PriceTick {
  symbol: string;
  price: number;
  changePercent24h: number;
  at: string;
}

export type FeedStatus = "connecting" | "live" | "down";

type PriceListener = (tick: PriceTick) => void;
type StatusListener = (status: FeedStatus) => void;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | null = null;
let status: FeedStatus = "connecting";

/** symbol → the components currently rendering it. */
const priceListeners = new Map<string, Set<PriceListener>>();
const statusListeners = new Set<StatusListener>();

/** The last tick per symbol, so a component that mounts late is not blank. */
const lastTick = new Map<string, PriceTick>();

function setStatus(next: FeedStatus): void {
  if (status === next) return;
  status = next;
  for (const listener of statusListeners) listener(next);
}

/** Tell the server exactly which symbols are on screen. Nothing more. */
function sendInterests(): void {
  if (!socket?.connected) return;
  socket.emit("watch", [...priceListeners.keys()]);
}

function connect(): Socket {
  if (socket) return socket;

  socket = io(`${API_URL}/market`, {
    transports: ["websocket"],
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });

  socket.on("connect", () => {
    setStatus("live");
    sendInterests();
  });

  socket.on("price", (tick: PriceTick) => {
    lastTick.set(tick.symbol, tick);
    const listeners = priceListeners.get(tick.symbol);
    if (listeners) for (const listener of listeners) listener(tick);
  });

  /*
   * The exchange feed went down — reported by the backend, not guessed at here.
   *
   * For most products a dropped feed is an inconvenience. For a trading terminal
   * it is a hazard: every price on screen was true when it arrived and may be
   * worthless now. Say so.
   */
  socket.on("feed", (payload: { status: "up" | "down" }) => {
    setStatus(payload.status === "up" ? "live" : "down");
  });

  socket.on("disconnect", () => setStatus("down"));
  socket.on("connect_error", () => setStatus("down"));

  return socket;
}

/** Subscribe to one symbol. Returns the unsubscribe. */
export function watchSymbol(symbol: string, listener: PriceListener): () => void {
  const key = symbol.toUpperCase();

  connect();

  if (!priceListeners.has(key)) priceListeners.set(key, new Set());
  priceListeners.get(key)!.add(listener);

  // A component mounting into an existing feed should not sit blank until the
  // next tick — which, on a slow pair, could be a long time.
  const cached = lastTick.get(key);
  if (cached) listener(cached);

  sendInterests();

  return () => {
    const listeners = priceListeners.get(key);
    if (!listeners) return;

    listeners.delete(listener);

    // Nobody is rendering this symbol any more — stop paying for its ticks.
    if (listeners.size === 0) {
      priceListeners.delete(key);
      sendInterests();
    }
  };
}

export function watchFeedStatus(listener: StatusListener): () => void {
  connect();
  statusListeners.add(listener);
  listener(status);

  return () => {
    statusListeners.delete(listener);
  };
}
